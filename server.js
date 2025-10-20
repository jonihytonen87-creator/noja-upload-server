import express from "express";
import SFTP from "ssh2-sftp-client";

const app = express();
app.use(express.json());

// --- Turvallinen API-avaimen tarkistus (skip health endpoints) ---
app.use((req, res, next) => {
  // Allow health checks without API key
  if (req.path === "/" || req.path === "/health") {
    return next();
  }
  
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    return res.status(403).json({ 
      error: "Invalid API key",
      hint: "Add 'X-API-Key' header with your API key"
    });
  }
  next();
});

// --- Testi Finvoice XML -generaattori ---
function generateTestFinvoiceXml(invoiceId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Finvoice Version="3.0" xmlns="http://www.finvoice.fi/schema/finvoice">
  <SellerPartyDetails>
    <SellerOrganisationName>Testi Oy</SellerOrganisationName>
    <SellerOrganisationTaxCode>FI12345678</SellerOrganisationTaxCode>
  </SellerPartyDetails>
  <BuyerPartyDetails>
    <BuyerOrganisationName>Nordic Work Factory Ltd Oy</BuyerOrganisationName>
  </BuyerPartyDetails>
  <InvoiceDetails>
    <InvoiceNumber>${invoiceId}</InvoiceNumber>
    <InvoiceTypeCode>INV01</InvoiceTypeCode>
  </InvoiceDetails>
  <InvoiceRow>
    <ArticleName>Testituote</ArticleName>
    <OrderedQuantity UnitCode="C62">1</OrderedQuantity>
  </InvoiceRow>
  <InvoiceTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">1.00</InvoiceTotalVatExcludedAmount>
</Finvoice>`;
}

// --- Pää-endpoint: NOJA SFTP upload ---
app.post("/test-upload", async (req, res) => {
  const id = req.body?.invoiceId || `FINVOICE_TEST_${Date.now()}`;
  const xml = req.body?.xml || generateTestFinvoiceXml(id);

  const sftp = new SFTP();
  try {
    await sftp.connect({
      host: process.env.NOJA_SFTP_HOST,
      port: Number(process.env.NOJA_SFTP_PORT || 22),
      username: process.env.NOJA_SFTP_USER,
      password: process.env.NOJA_SFTP_PASS,
      readyTimeout: 20000,
    });

    const dir = process.env.NOJA_SFTP_IN || "/filein";
    
    // Varmista että kansio on olemassa
    try { 
      await sftp.mkdir(dir, true); 
    } catch (mkdirErr) {
      console.log('mkdir (may already exist):', mkdirErr.message);
    }

    const remotePath = `${dir}/${id}.xml`;
    await sftp.put(Buffer.from(xml, "utf8"), remotePath);
    
    // Hae lista viimeisimmistä tiedostoista
    const list = await sftp.list(dir);
    const recent = list
      .sort((a, b) => (b.modifyTime || 0) - (a.modifyTime || 0))
      .slice(0, 10)
      .map(f => ({ 
        name: f.name, 
        size: f.size, 
        mtime: f.modifyTime 
      }));

    res.json({ 
      ok: true, 
      remotePath, 
      invoiceId: id,
      count: recent.length,
      recent 
    });
  } catch (err) {
    console.error('SFTP error:', err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    try { await sftp.end(); } catch {}
  }
});

// --- Laskun lähetys (varsinainen Finvoice XML) ---
app.post("/send-finvoice", async (req, res) => {
  const { filename, xml } = req.body;
  if (!filename || !xml) {
    return res.status(400).json({ error: "Missing filename or xml" });
  }

  const sftp = new SFTP();
  try {
    await sftp.connect({
      host: process.env.NOJA_SFTP_HOST,
      port: Number(process.env.NOJA_SFTP_PORT || 22),
      username: process.env.NOJA_SFTP_USER,
      password: process.env.NOJA_SFTP_PASS,
    });

    const dir = process.env.NOJA_SFTP_IN || "/filein";
    const remotePath = `${dir}/${filename}`;

    await sftp.put(Buffer.from(xml, "utf-8"), remotePath);

    res.json({ ok: true, uploaded: remotePath });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    try { await sftp.end(); } catch {}
  }
});

// --- Health check (ei vaadi API-avainta) ---
app.get("/", (_, res) => {
  res.json({ 
    status: "ok",
    service: "NOJA SFTP Upload Service",
    version: "1.0.0",
    endpoints: ["/test-upload", "/send-finvoice"],
    env: {
      hasApiKey: !!process.env.API_KEY,
      hasSftpHost: !!process.env.NOJA_SFTP_HOST,
      hasSftpUser: !!process.env.NOJA_SFTP_USER,
      hasSftpPass: !!process.env.NOJA_SFTP_PASS,
    }
  });
});

// --- Health check ilman API-avainta (testaamista varten) ---
app.get("/health", (_, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
