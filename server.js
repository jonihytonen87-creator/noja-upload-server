import express from "express";
import SFTPClient from "ssh2-sftp-client";

const app = express();
app.use(express.json());

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
    await sftp.connect({
      host: process.env.NOJA_SFTP_HOST,
      port: Number(process.env.NOJA_SFTP_PORT || 22),
      username: process.env.NOJA_SFTP_USER,
      password: process.env.NOJA_SFTP_PASS,
    });

    const dir = process.env.NOJA_SFTP_REMOTE_DIR || "/invoices/out";
    try { await sftp.mkdir(dir, true); } catch {}
    const remotePath = `${dir}/${id}.xml`;

    await sftp.put(Buffer.from(xml, "utf8"), remotePath);
    const recent = await sftp.list(dir);

    res.json({ ok: true, remotePath, count: recent.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    try { await sftp.end(); } catch {}
  }
});

app.get("/", (_, res) => res.send("✅ Noja-upload-server toimii"));
app.listen(process.env.PORT || 3000, () => console.log("Server running"));

app.use(express.json());

// 🔹 1. Perusreitti: näyttää että palvelin toimii
app.get("/", (req, res) => {
  res.send("✅ Noja-upload-server toimii");
});

// 🔹 2. Health check: näkyy selaimessa myös /noja-upload osoitteessa
app.get("/noja-upload", (req, res) => {
  res.json({
    ok: true,
    message: "Käytä POST-metodia lähetykseen tähän reittiin.",
    hint: "POST /noja-upload { invoiceId: 'TESTI_123' }",
  });
});

// 🔹 3. Pääreitti POST-pyyntöihin Lovablesta tai Supabasesta
app.post("/noja-upload", async (req, res) => {
  try {
    const { invoiceId } = req.body;
    console.log("📦 Saapui pyyntö Noja-uploadille:", invoiceId);

    // Tässä kohtaa myöhemmin lisätään SFTP-lähetys Nojalle.
    // Nyt vain simuloidaan onnistunut testivastaus:
    res.json({
      ok: true,
      invoiceId: invoiceId || "TESTI_001",
      message: "✅ Render vastasi oikein ja yhteys toimii.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Virhe POST /noja-upload:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔹 4. Käynnistä palvelin Renderin oletusportissa
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
