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
