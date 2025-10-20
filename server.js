// ESM-versio (package.json: "type": "module")
import express from "express";
import SFTPClient from "ssh2-sftp-client";

const app = express();
app.use(express.json());

// GET / – terveystarkastus
app.get("/", (_req, res) => {
  res.send("✅ Noja-upload-server toimii");
});

// GET /noja-upload – näkyy selaimessa, kertoo käyttää POSTia
app.get("/noja-upload", (_req, res) => {
  res.json({
    ok: true,
    message: "Käytä POST-metodia lähetykseen tähän reittiin.",
    hint: "POST /noja-upload { invoiceId: 'TESTI_123' }"
  });
});

// POST /noja-upload – muodostaa Finvoice-XML:n ja lähettää SFTP:lle
app.post("/noja-upload", async (req, res) => {
  const id = req.body?.invoiceId || `FINVOICE_TEST_${Date.now()}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Finvoice Version="3.0" xmlns="http://www.finvoice.fi/schema/finvoice">
  <SellerPartyDetails><SellerOrganisationName>Testi Oy</SellerOrganisationName></SellerPartyDetails>
  <BuyerPartyDetails><BuyerOrganisationName>Nordic Work Factory Ltd Oy</BuyerPartyDetails>
  <InvoiceDetails><InvoiceNumber>${id}</InvoiceNumber><InvoiceTypeCode>INV01</InvoiceTypeCode></InvoiceDetails>
  <InvoiceRow><ArticleName>Testituote</ArticleName><OrderedQuantity UnitCode="C62">1</OrderedQuantity></InvoiceRow>
  <InvoiceTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">1.00</InvoiceTotalVatExcludedAmount>
</Finvoice>`;

  const sftp = new SFTPClient();
  try {
    // 🔧 Ympäristömuuttujat (Render: Settings → Environment)
    const host = process.env.NOJA_SFTP_HOST;              // esim. sftp.noja.fi
    const port = Number(process.env.NOJA_SFTP_PORT || 22);// sinulla: 22765
    const username = process.env.NOJA_SFTP_USER;          // esim. laatulaskutus
    const password = process.env.NOJA_SFTP_PASS;          // salasana
    const dir = process.env.NOJA_SFTP_REMOTE_DIR || "/filein";

    if (!host || !username || !password) {
      return res.status(500).json({ ok: false, error: "SFTP env-muuttujat puuttuvat" });
    }

    await sftp.connect({ host, port, username, password, readyTimeout: 20000 });

    // Luo kohdehakemisto tarvittaessa (ei haittaa, jos on jo olemassa)
    try { await sftp.mkdir(dir, true); } catch {}

    const remotePath = `${dir}/${id}.xml`;
    await sftp.put(Buffer.from(xml, "utf8"), remotePath);

    // Listaa viimeiset tiedostot kuittaukseksi
    const list = await sftp.list(dir);
    const recent = list
      .sort((a, b) => (b.modifyTime || 0) - (a.modifyTime || 0))
      .slice(0, 5)
      .map(f => ({ name: f.name, size: f.size, mtime: f.modifyTime }));

    res.json({ ok: true, remotePath, recent });
  } catch (err) {
    console.error("❌ SFTP-virhe:", err);
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    try { await sftp.end(); } catch {}
  }
});

// Käynnistys (Render antaa PORT-ympäristömuuttujan)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
