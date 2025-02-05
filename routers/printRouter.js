import express from 'express';
import QRCode from 'qrcode';
import QrCodeDB from '../models/qrcodeVerificstionModal.js';
import { chromium } from 'playwright';
import Return from '../models/returnModal.js';
import { DailyTransaction } from '../models/dailyTransactionsModal.js';
import puppeteer from 'puppeteer';
import Billing from '../models/billingModal.js';
import CustomerAccount from '../models/customerModal.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import TransportPayment from '../models/transportPayments.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';

const printRouter = express.Router();



// Helper function to safely get values or return "N/A" if undefined
const safeGet = (value) => (value ? value : 'N/A');

printRouter.post('/generate-pdf', async (req, res) => {
  const {
    invoiceNo,
    invoiceDate,
    salesmanName,
    expectedDeliveryDate,
    deliveryStatus,
    paymentStatus,
    paymentAmount,
    paymentMethod,
    paymentReceivedDate,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    billingAmount,
    subTotal,
    cgst,
    sgst,
    discount,
    products,
  } = safeGet(req.body);

  // Safely handle products array
  const productList = Array.isArray(products) ? products : [];
  const totalProducts = productList.length;

  const productsPerPage = 10;

  if(!billingAmount){
    res.status(500).json({message: 'error' });
  }

  // Function to generate invoice content
  const generatePageHTML = ( 
    productsChunk,
    pageNumber,
    totalPages,
    showTotals
  ) => `
  <div class="invoice">
        <!-- Header Section -->
        <div class="header">
            <p style="font-weight: 900;">KK TRADING</p>
            <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
            <div>
                <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                <p>Salesman: <strong>${salesmanName}</strong></p>
                <p>Additional Info:</p>
            </div>
            <div>
                <p><strong>From:</strong></p>
                <p style="font-weight: bold;">KK TRADING</p>
                <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                <p style="font-size: 10px;">Alappuzha, 688503</p>
                <p style="font-size: 10px;">Contact: 0477 2080282</p>
                <p style="font-size: 10px;">tradeinkk@gmail.com</p>
            </div>
        </div>
        <div class="invoice-info">

        <div style="font-size: 10px;">
            <p><strong>Estimate To:</strong></p>
            <p style="font-weight: bold;">${customerName}</p>
            <p>${customerAddress}</p>
            <p>State: Kerala</p>
            <p>Contact: ${customerContactNumber}</p>
        </div>

        <div style="font-size: 10px;">
            <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
        </div>

        <div style="font-size: 10px;">
            <p><strong>Payment:</strong></p>
            <p>Amount Paid: ${paymentAmount} </p>
            <p>Payment Method: ${paymentMethod || ''}</p>
            <p>Received Date: ${paymentReceivedDate || ''} </p>
            <p>Remaining Amount: ${(parseFloat(billingAmount) - parseFloat( paymentAmount + discount )).toFixed(2)}  </p>
        </div>

        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>Sl</th>
                    <th>Item Id</th>
                    <th>Item Name</th>
                    <th>QTY</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>QTY(nos)</th>
                    <th>Unit Rate + Tax</th>
                    <th>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                ${
                    productsChunk.length > 0
                      ? productsChunk.map((product,index) => `
                          <tr>
          <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                              <td>${safeGet(product.item_id)}</td>
                              <td>${safeGet(product.name)}</td>
                              <td>${safeGet(product.enteredQty)}</td>
                              <td>${safeGet(product.unit)}</td>
                              <td>${safeGet(product.sellingPrice)}</td>
                              <td>${safeGet(product.quantity)}</td>
                              <td>${safeGet(product.sellingPriceinQty)}</td>
                              <td>${(product.quantity * product.sellingPriceinQty).toFixed(2) || 'N/A'}</td>
                          </tr>`).join('')
                      : '<tr><td colspan="5">No Products Available</td></tr>'
                  }
            </tbody>
        </table>

        <!-- Totals Section -->
        ${showTotals ? `
        <div style="display: flex; justify-content: space-between;" class="totals">
            <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                <p><strong>Authorised Signatory:</strong></p>
                <p style="margin-top: 40px;">Date: ------------------------------</p>
                <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
            </div>
            <div>
                <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                <p>Round Off: <span>0.0</span></p>
                <p style="font-size: 15px;"><strong>Total Amount: <span>${(billingAmount)}</span></strong></p>
            </div>
        </div> ` : `` }

        <!-- Payment Instructions -->

        <!-- Footer Section -->
                <footer>Page ${pageNumber} of ${totalPages}</footer>
        <footer>
            <p>Thank you for your business! 45 ദിവസത്തിന് ശേഷം ഉൽപ്പന്നങ്ങൾ മാറ്റിസ്ഥാപിക്കാനോ തിരികെ നൽകാനോ കഴിയില്ല. 30 ദിവസത്തിനുള്ളിൽ പകരം വയ്ക്കുന്നവർക്ക് മാത്രം ജിഎസ്ടി ഉൾപ്പെടെയുള്ള റീഫണ്ടുകൾ.</p>
        </footer>
    </div>
  `;

  // Generate the full HTML content
  let combinedHTMLContent = '';
  const totalPages = Math.ceil(productList.length / productsPerPage);

  for (let i = 0; i < totalPages; i++) {
    const productsChunk = productList.slice(
      i * productsPerPage,
      (i + 1) * productsPerPage
    );
    const showTotals = i === totalPages - 1;
    combinedHTMLContent += generatePageHTML(
      productsChunk,
      i + 1,
      totalPages,
      showTotals
    );
  }

  const fullHTMLContent = `
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK INVOICE</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }
    </style>
    </head>
    <body>
    ${combinedHTMLContent}
    </body>
    </html>
`;

  // Generate the PDF using Playwright
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(fullHTMLContent, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' },
    });

    await browser.close();

    // Send the PDF as a response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=Invoice_${invoiceNo}.pdf`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// New route to send the HTML content directly

printRouter.post('/generate-invoice-html', async (req, res) => {
  try {
    let {
      invoiceNo,
      invoiceDate,
      salesmanName,
      salesmanPhoneNumber,
      expectedDeliveryDate,
      paymentAmount,
      paymentMethod,
      paymentReceivedDate,
      customerName,
      customerAddress,
      customerContactNumber,
      marketedBy,
      billingAmount,
      subTotal,
      transportation,
      unloading,
      handling,
      discount,
      products,
      perItemDiscount,
      grandTotal,
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo) {
      return res.status(400).json({ error: 'invoiceNo is required' });
    }

    // Safely handle products array
    const productList = Array.isArray(products) ? products : [];
    const totalProducts = productList.length;

    // Convert numeric fields safely to float
    billingAmount = parseFloat(billingAmount) || 0;
    paymentAmount = parseFloat(paymentAmount) || 0;
    subTotal = parseFloat(subTotal) || 0;
    discount = parseFloat(discount) || 0;
    transportation = parseFloat(transportation) || 0;
    unloading = parseFloat(unloading) || 0;
    handling = parseFloat(handling) || 0;
    grandTotal = parseFloat(grandTotal) || 0;
    perItemDiscount = parseFloat(perItemDiscount) || 0;

    const productsPerPage = 10;
    const NewQrCodeId = `${invoiceNo}-${Date.now()}`;

    // Save a record to QrCodeDB if needed
    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: invoiceNo,
      });
      await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Helper to safely compute all the product-based calculations
    const computeProductFields = (product) => {
      // Base total: quantity * selling price
      const baseTotal =
        (parseFloat(product.quantity) || 0) *
        (parseFloat(product.sellingPriceinQty) || 0);

        const itemBase = product.quantity * product.sellingPriceinQty;

// This row's discount portion: "itemBase / sumOfBase * discount"
let sumOfBase = 0;
productList.forEach((p) => {
  sumOfBase += (parseFloat(p.quantity) || 0) * (parseFloat(p.sellingPriceinQty) || 0);
});
const discountRatio = sumOfBase > 0 ? (parseFloat(discount) || 0) / sumOfBase : 0;
const itemDiscount = itemBase * discountRatio;
        
        const discountAmt = baseTotal * discountRatio;
        
      // Calculate GST rate and amount
      const gstRate = parseFloat(product.gstRate) || 0; // e.g., 18 means 18%
      const rateWithoutGST = itemBase / (1 + gstRate / 100) - itemDiscount;
      
      // Calculate discount amount
      // const perItemDiscount = parseFloat(perItemDiscount) || 0;
      // Adjust for discount (assumes discount applies to rate without GST)
      const rateAfterDiscount = rateWithoutGST;
      const gstAmount = rateWithoutGST * (gstRate / 100); // GST component of the base total
    
      // Split GST equally between CGST and SGST
      const cgst = gstAmount / 2;
      const sgst = gstAmount / 2;
    
      // Final net amount after discount and adding GST
      const netAmount = rateAfterDiscount + gstAmount;
    
      return {
        baseTotal,
        discountAmt,
        rateWithoutGST,
        gstRate,
        gstAmount,
        cgst,
        sgst,
        netAmount,
      };
    };
    

    // Generate the invoice page HTML
    const generatePageHTML = (
      productsChunk,
      pageNumber,
      totalPages,
      showTotals
    ) => {
      return `
      <div class="invoice">
        <!-- Header Section -->
        <div class="header">
            <p style="font-weight: 900;">KK TRADING</p>
            <p style="font-size: 14px;margin-top: 10px;font-weight: 900;">
              Tiles, Granites, Sanitary Wares, UV Sheets
            </p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
          <div style="font-size: 12px;">
              <p style="font-size: 14px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
              <p>Estimation Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
              <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
              <p>Salesman: <strong>${salesmanName}</strong></p>
              <p>Salesman Contact No: <strong>${salesmanPhoneNumber}</strong></p>
              <p>Marketed By: <strong>${marketedBy}</strong></p>
              <p style="margin-top:5px;font-weight:bold;">Additional info:</p>
          </div>

          <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
            <img
              src="${qrCodeDataURL}"
              alt="QR Code for Invoice"
              style="width: 60px; height: 60px;" 
            />
          </div>

          <div style="font-size: 12px;">
              <p><strong>From:</strong></p>
              <p style="font-weight: bold;">KK TRADING</p>
              <p style="font-size: 12px;">Moncompu, Chambakulam, Alappuzha</p>
              <p style="font-size: 12px;">Alappuzha, 688503</p>
              <p style="font-size: 12px;">Contact: 0477 2080282</p>
              <p style="font-size: 12px;">tradeinkk@gmail.com</p>
          </div>
        </div>

        <div class="invoice-info">
          <div style="font-size: 12px;">
              <p><strong>Estimate To:</strong></p>
              <p style="font-weight: bold;">Customer Name: ${customerName}</p>
              <p>Address: ${customerAddress}</p>
              <p>State: Kerala</p>
              <p>Contact: ${customerContactNumber}</p>
          </div>

          <div style="font-size: 14px;margin-right: 160px;font-weight:900;"><strong>Estimate Bill</strong></p>
          </div>

          <div style="font-size: 12px;display: none;">
            <p><strong>Payment:</strong></p>
            <p>Amount Paid: ₹${paymentAmount.toFixed(2)}</p>
            <p>Method: ${paymentMethod || ''}</p>
            <p>Received Date: ${paymentReceivedDate || ''}</p>
            <p>Remaining: ₹${(billingAmount - paymentAmount).toFixed(2)}</p>
          </div>
        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Sl</th>
              <th>Item Id</th>
              <th>Item Name</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Rate</th>
              <th>GST %</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>Disc</th>
              <th>Net Amount</th>
            </tr>
          </thead>
          <tbody>
          ${
            productsChunk.length > 0
              ? productsChunk
                  .map((product, index) => {
                    const {
                      baseTotal,
                      discountAmt,
                      rateWithoutGST,
                      gstRate,
                      gstAmount,
                      cgst,
                      sgst,
                      netAmount,
                    } = computeProductFields(product);

                    return `
                      <tr>
                        <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td>
                        <td>${safeGet(product.item_id)}</td>
                        <td>${safeGet(product.name)}</td>
                        <td>${safeGet(product.enteredQty)}</td>
                        <td>${safeGet(product.unit)}</td>
                        <td>₹${parseFloat(product.sellingPrice || 0).toFixed(2)}</td>
                        <td>₹${rateWithoutGST.toFixed(2)}</td>
                        <td>${gstRate}%</td>
                        <td>₹${cgst.toFixed(2)}</td>
                        <td>₹${sgst.toFixed(2)}</td>
                        <td>₹${discountAmt.toFixed(2)}</td>
                        <td>₹${netAmount.toFixed(2)}</td>
                      </tr>
                    `;
                  })
                  .join('')
              : '<tr><td colspan="12">No Products Available</td></tr>'
          }
          </tbody>
        </table>

        <!-- Totals Section -->
        ${
          showTotals
            ? `
              <div class="totals-section">
                <div style="display: flex; justify-content: space-between;margin-top:20px;" class="totals">
                  <!-- Signature / Stamp area -->
                  <div style="font-size: 12px;margin-top: 30px;text-align:left;" class="payment-instructions">
                  <p style="margin-top: 40px;">Date: ${new Date(invoiceDate).toLocaleDateString('en-GB')} </p>
                  <p><strong>Authorised Signatory:</strong></p>
                      <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
                  </div>

                  <!-- Right side totals -->
                  <div style="font-size: 14px;text-align:right;">
                      <p>Subtotal: <span>₹${subTotal.toFixed(2)}</span></p>
                      <p>Discount: <span>₹${discount.toFixed(2)}</span></p>
                      <p>Transportation: <span>₹${transportation.toFixed(2)}</span></p>
                      <p>Unloading: <span>₹${unloading.toFixed(2)}</span></p>
                      <p>Handling: <span>₹${handling.toFixed(2)}</span></p>
                      <p style="margin-top:10px;">Round Off: <span>₹0.00</span></p>
                      <p style="font-size: 18px;margin-top:10px;"><strong>Grand Total: <span>₹${grandTotal.toFixed(2)}</span></strong></p>
                  </div>
                </div>
              </div>
              `
            : ``
        }

        <!-- Footer Section -->
        <footer>Page ${pageNumber} of ${totalPages}</footer>

        <footer style="margin-top:10px;">
          <p style="font-size: 12px; color: #444;">
            Thank you for your business! 45 ദിവസത്തിന് ശേഷം ഉൽപ്പന്നങ്ങൾ മാറ്റിസ്ഥാപിക്കാനോ തിരികെ നൽകാനോ കഴിയില്ല.
            30 ദിവസത്തിനുള്ളിൽ പകരം വയ്ക്കുന്നവർക്ക് മാത്രം ജിഎസ്ടി ഉൾപ്പെടെയുള്ള റീഫണ്ടുകൾ.
          </p>
        </footer>
      </div>
      `;
    };

    // Generate pages if products exceed productsPerPage
    let combinedHTMLContent = '';
    const totalPages = Math.ceil(productList.length / productsPerPage) || 1;

    for (let i = 0; i < totalPages; i++) {
      const productsChunk = productList.slice(
        i * productsPerPage,
        (i + 1) * productsPerPage
      );
      const showTotals = i === totalPages - 1; // only show totals on the last page
      combinedHTMLContent += generatePageHTML(
        productsChunk,
        i + 1,
        totalPages,
        showTotals
      );
    }

    // Wrap final content in HTML/CSS
    const fullHTMLContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KK INVOICE</title>
      <link href="https://fonts.googleapis.com/css2?family=Poppins&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0; 
          padding: 0;
          box-sizing: border-box;
          font-family: 'Poppins', sans-serif;
        }
        body {
          background-color: #f9f9f9;
          margin: 10px;
        }
        .invoice {
          background-color: #fff;
          width: 100%;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
          margin: auto;
          page-break-after: always;
        }
        .header {
          background-color: #960101; /* Dark Red */
          padding: 20px;
          color: #fff;
          text-align: center;
          font-size: 22px;
          font-weight: bold;
          border-top-left-radius: 10px;
          border-top-right-radius: 10px;
        }
        .invoice-info {
          display: flex;
          justify-content: space-between;
          margin-top: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
          font-size: 12px;
          color: #333;
          line-height: 1.6;
          margin-right: 10px;
        }
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }
        .invoice-table th {
          background-color: #f4cccc; /* Light Red */
          color: #960101; /* Dark Red */
          padding: 10px;
          border: 1px solid #ddd;
          font-size: 12px;
        }
        .invoice-table td {
          padding: 10px;
          text-align: center;
          border: 1px solid #ddd;
          font-size: 12px;
        }
        .totals-section {
          margin-top: 20px;
        }
        .totals {
          text-align: right;
        }
        .totals p {
          margin: 5px 0;
          font-size: 14px;
        }
        .totals span {
          font-weight: bold;
          color: #960101;
        }
        .payment-instructions {
          margin-top: 30px;
        }
        .qr-code-section img {
          width: 60px;
          height: 60px;
        }
        footer {
          text-align: center;
          margin-top: 20px;
          font-size: 12px;
          color: #777;
        }

        @page {
          margin: 20px;
        }

        @media print {
          body {
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #printable, #printable * {
            visibility: visible;
          }
          #printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .invoice {
            page-break-inside: avoid;
          }
        }
      </style>
      <script>
        // Auto-print on page load
        window.onload = function() {
          window.print();
        };
      </script>
    </head>
    <body>
      <div id="printable">
        ${combinedHTMLContent}
      </div>
    </body>
    </html>`;

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});






// POST /api/daily/transactions/generate-report
printRouter.post('/daily/generate-report', async (req, res) => {
  try {
    const { reportData, reportParams } = req.body;

    // Validate received data
    if (!reportData || !Array.isArray(reportData)) {
      return res.status(400).send('<h3>Error: Invalid report data.</h3>');
    }

    // Destructure report parameters
    const { fromDate, toDate, activeTab, filterCategory, filterMethod, searchQuery, sortOption } = reportParams;

    // Fetch all payment accounts
    const paymentAccounts = await PaymentsAccount.find({});

    // Generate QR Code (optional)
    const reportId = `report-${Date.now()}`;
    const qrCodeDataURL = await QRCode.toDataURL(reportId);

    // Helper Functions
    const capitalizeFirstLetter = (string) => {
      if (!string) return '';
      return string.charAt(0).toUpperCase() + string.slice(1);
    };

    const formatSortOption = (option) => {
      switch(option) {
        case 'date_desc':
          return 'Date (Latest First)';
        case 'date_asc':
          return 'Date (Oldest First)';
        case 'amount_asc':
          return 'Amount (Low to High)';
        case 'amount_desc':
          return 'Amount (High to Low)';
        default:
          return 'Unknown';
      }
    };

    // Calculate Totals
    const totalIn = dataFilter(reportData, 'in');
    const totalOut = dataFilter(reportData, 'out');
    const totalTransfer = dataFilter(reportData, 'transfer');

    function dataFilter(data, type) {
      return data
        .filter(t => t.type === type)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0)
        .toFixed(2);
    }

    // Function to generate report HTML
    const generateReportHTML = (data, params, qrCode, paymentAccounts) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Daily Transactions Report</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  margin: 0;
                  padding: 0;
                  background-color: #f4f4f4;
                  color: #333;
              }
              .container {
                  width: 90%;
                  max-width: 1200px;
                  margin: 30px auto;
                  background-color: #fff;
                  padding: 25px;
                  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                  border-radius: 10px;
              }
              .header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  border-bottom: 1px solid #ddd;
                  padding-bottom: 15px;
                  margin-bottom: 25px;
              }
              .header div {
                  text-align: left;
              }
              .header img {
                  width: 100px;
                  height: auto;
              }
              .payment-accounts {
                  margin-bottom: 25px;
              }
              .payment-accounts h2 {
                  font-size: 18px;
                  margin-bottom: 10px;
                  border-bottom: 1px solid #ddd;
                  padding-bottom: 5px;
              }
              .payment-accounts table {
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 14px;
              }
              .payment-accounts th, .payment-accounts td {
                  border: 1px solid #ddd;
                  padding: 10px;
                  text-align: center;
              }
              .payment-accounts th {
                  background-color: #f9f9f9;
                  font-weight: 600;
              }
              .filters {
                  margin-bottom: 25px;
                  padding: 15px;
                  background-color: #fafafa;
                  border-radius: 8px;
                  border: 1px solid #eee;
              }
              .filters p {
                  margin: 5px 0;
                  font-size: 14px;
              }
              .totals {
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 25px;
              }
              .totals div {
                  flex: 1;
                  text-align: center;
                  padding: 15px;
                  background-color: #fafafa;
                  border: 1px solid #eee;
                  border-radius: 8px;
                  margin: 0 5px;
              }
              .totals div:first-child {
                  margin-left: 0;
              }
              .totals div:last-child {
                  margin-right: 0;
              }
              .totals p {
                  margin: 5px 0;
                  font-size: 16px;
              }
              table {
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 14px;
              }
              th, td {
                  border: 1px solid #ddd;
                  padding: 10px;
                  text-align: center;
              }
              th {
                  background-color: #f9f9f9;
                  font-weight: 600;
              }
              tr:nth-child(even) {
                  background-color: #fdfdfd;
              }
              .type-in {
                  background-color: #e8f5e9;
                  color: #2e7d32;
                  font-weight: bold;
              }
              .type-out {
                  background-color: #ffebee;
                  color: #c62828;
                  font-weight: bold;
              }
              .type-transfer {
                  background-color: #e3f2fd;
                  color: #1565c0;
                  font-weight: bold;
              }
              footer {
                  text-align: center;
                  margin-top: 30px;
                  font-size: 12px;
                  color: #777;
              }
              @media print {
                  body * {
                    visibility: hidden;
                  }
                  .container, .container * {
                    visibility: visible;
                  }
                  .container {
                    position: absolute;
                    left: 0;
                    top: 0;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <div>
                      <h1>KK TRADING</h1>
                      <p>Daily Transactions Report</p>
                      <p>From: ${new Date(params.fromDate).toLocaleDateString()} To: ${new Date(params.toDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                      <img src="${qrCode}" alt="QR Code" />
                  </div>
              </div>
              
              <div class="payment-accounts">
                  <h2>Payment Accounts Balances</h2>
                  <table>
                      <thead>
                          <tr>
                              <th>Account ID</th>
                              <th>Account Name</th>
                              <th>Balance Amount (₹)</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${paymentAccounts.map(account => `
                              <tr>
                                  <td>${account.accountId}</td>
                                  <td>${account.accountName}</td>
                                  <td>₹ ${account.balanceAmount.toFixed(2)}</td>
                              </tr>
                          `).join('')}
                      </tbody>
                  </table>
              </div>
              
              <div class="filters">
                  <p><strong>Active Tab:</strong> ${capitalizeFirstLetter(params.activeTab)}</p>
                  <p><strong>Category Filter:</strong> ${params.filterCategory || 'All'}</p>
                  <p><strong>Method Filter:</strong> ${params.filterMethod || 'All'}</p>
                  <p><strong>Search Query:</strong> ${params.searchQuery || 'None'}</p>
                  <p><strong>Sort Option:</strong> ${formatSortOption(params.sortOption)}</p>
              </div>

              <div class="totals">
                  <div>
                      <p>Total Payment In:</p>
                      <p style="color: #2e7d32;">₹ ${totalIn}</p>
                  </div>
                  <div>
                      <p>Total Payment Out:</p>
                      <p style="color: #c62828;">₹ ${totalOut}</p>
                  </div>
                  <div>
                      <p>Total Transfer:</p>
                      <p style="color: #1565c0;">₹ ${totalTransfer}</p>
                  </div>
              </div>

              <table>
                  <thead>
                      <tr>
                          <th>#</th>
                          <th>Date & Time</th>
                          <th>Category</th>
                          <th>Type</th>
                          <th>Payment From</th>
                          <th>Payment To</th>
                          <th>Amount (₹)</th>
                          <th>Method</th>
                          <th>Remark</th>
                          <th>Source</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${data.map((trans, index) => {
                        // Determine the class based on transaction type for coloring
                        let typeClass = '';
                        if (trans.type === 'in') typeClass = 'type-in';
                        else if (trans.type === 'out') typeClass = 'type-out';
                        else if (trans.type === 'transfer') typeClass = 'type-transfer';

                        let transmethod = trans.method;
                        if(paymentAccounts){
                          const acc = paymentAccounts.find(paymentAccount => paymentAccount.accountId === trans.method)
                          transmethod = acc? acc.accountName : trans.method;
                        }
                        return `
                          <tr class="${typeClass}">
                              <td>${index + 1}</td>
                              <td>${new Date(trans.date).toLocaleString()}</td>
                              <td>${trans.category || 'N/A'}</td>
                              <td>${capitalizeFirstLetter(trans.type)}</td>
                              <td>${trans.paymentFrom || 'N/A'}</td>
                              <td>${trans.paymentTo || 'N/A'}</td>
                              <td>₹ ${parseFloat(trans.amount).toFixed(2)}</td>
                              <td>${transmethod || 'N/A'}</td>
                              <td>${trans.remark || 'N/A'}</td>
                              <td>${capitalizeFirstLetter(trans.source)}</td>
                          </tr>
                      `;
                      }).join('')}
                  </tbody>
              </table>
              
              <footer>
                  <p>Daily Report - KK TRADING.</p>
              </footer>
          </div>
      </body>
      </html>
    `;

    const reportHTML = generateReportHTML(reportData, reportParams, qrCodeDataURL, paymentAccounts);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(reportHTML);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).send('<h3>Internal Server Error</h3>');
  }
});









// Route to generate purchase invoice HTML
// Route to generate purchase invoice HTML
printRouter.post('/generate-purchase-invoice-html', async (req, res) => {
  try {
    const {
      sellerId,
      sellerName,
      sellerAddress,
      sellerGst,
      invoiceNo,
      purchaseId,
      billingDate,
      invoiceDate,
      items,
      totals,
      transportationDetails,
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo || !purchaseId) {
      return res.status(400).json({ error: 'invoiceNo and purchaseId are required' });
    }

    // Safely handle items array
    const productList = Array.isArray(items) ? items : [];
    const totalProducts = productList.length;
    const billingAmount = parseFloat(totals.billingAmount) || 0;

    const productsPerPage = 5;
    const totalPages = Math.ceil(productList.length / productsPerPage);

    // Generate a unique QR Code ID
    const NewQrCodeId = `${invoiceNo}-${Date.now()}`;

    // Save QR Code ID to the database
    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: invoiceNo,
      });

      await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Function to generate invoice content per page
    const generatePageHTML = (productsChunk, pageNumber, totalPages, showTotals) => `
      <div class="invoice">
        <!-- Header Section -->
        <div class="header">
          <p style="font-weight: 900; font-size: 24px;">KK TRADING</p>
          <p style="font-size: 14px; margin-top: 5px; font-weight: 600;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
          <div>
            <p style="font-size: 14px; font-weight: bolder;">Purchase No: <strong>${invoiceNo}</strong></p>
            <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
            <p>Billing Date: <strong>${new Date(billingDate).toLocaleDateString()}</strong></p>
            <p>Seller: <strong>${sellerName}</strong></p>
          </div>

          <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
            <img src="${qrCodeDataURL}" alt="QR Code for Invoice" style="width: 80px; height: 80px;" />
          </div>

          <div>
            <p><strong>From:</strong></p>
            <p style="font-weight: bold;">KK TRADING</p>
            <p style="font-size: 12px;">Moncompu, Chambakulam, Road</p>
            <p style="font-size: 12px;">Alappuzha, 688503</p>
            <p style="font-size: 12px;">Contact: 0477 2080282</p>
            <p style="font-size: 12px;">tradeinkk@gmail.com</p>
          </div>
        </div>

        <div class="invoice-info">
          <!-- Seller Details -->
          <div style="font-size: 12px;">
            <p><strong>Seller Details:</strong></p>
            <p style="font-weight: bold;">${sellerName}</p>
            <p>${sellerAddress}</p>
            <p>State: Kerala</p>
            <p>GST: ${sellerGst || 'N/A'}</p>
            <p>Seller ID: ${sellerId}</p>
          </div>

          <!-- Transportation Details -->
          <div style="font-size: 12px;">
            <p><strong>Transportation Details:</strong></p>
            <p><strong>Logistic Transport:</strong></p>
            <p>Company: ${transportationDetails.logistic.transportCompanyName || 'N/A'}</p>
            <p>GST: ${transportationDetails.logistic.companyGst || 'N/A'}</p>
            <p>Transportation Charges: ₹${parseFloat(transportationDetails.logistic.transportationCharges || 0).toFixed(2)}</p>
            <p>Remark: ${transportationDetails.logistic.remark || 'N/A'}</p>
            <br/>
            <p><strong>Local Transport:</strong></p>
            <p>Company: ${transportationDetails.local.transportCompanyName || 'N/A'}</p>
            <p>GST: ${transportationDetails.local.companyGst || 'N/A'}</p>
            <p>Transportation Charges: ₹${parseFloat(transportationDetails.local.transportationCharges || 0).toFixed(2)}</p>
            <p>Remark: ${transportationDetails.local.remark || 'N/A'}</p>
          </div>
        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Sl</th>
              <th>Item ID</th>
              <th>Item Name</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Purchased Qty</th>
              <th>P. Unit</th>
              <th>Qty (in Nos)</th>
              <th>Purchase Expense</th>
              <th>Bill Price</th>
              <th>Total</th>
              <th>Other Expense</th>
              <th>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              productsChunk.length > 0
                ? productsChunk
                    .map(
                      (product, index) => `
                <tr>
                  <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td>
                  <td>${safeGet(product.itemId)}</td>
                  <td>${safeGet(product.name)}</td>
                  <td>${safeGet(product.brand) || 'N/A'}</td>
                  <td>${safeGet(product.category) || 'N/A'}</td>
                  <td>${safeGet(product.quantity)}</td>
                  <td>${safeGet(product.pUnit) || 'N/A'}</td>
                  <td>${safeGet(product.quantityInNumbers)}</td>
                  <td>${safeGet(product.cashPartPrice) || 'N/A'}</td>
                  <td>${safeGet(product.billPartPrice) || 'N/A'}</td>
                  <td>₹${((parseFloat(product.billPartPrice) + parseFloat(product.cashPartPrice) ) * product.quantity ).toFixed(2)}</td>
                  <td>₹${parseFloat(product.allocatedOtherExpense).toFixed(2)}</td>
                  <td>₹${
                  
                  ((
                    product.quantity *
                    (parseFloat(product.billPartPrice) + parseFloat(product.cashPartPrice))
                  ) + parseFloat(
                   product.allocatedOtherExpense
                    ) )
                    
                  .toFixed(2)}</td>
                </tr>`
                    )
                    .join('')
                : '<tr><td colspan="14">No Products Available</td></tr>'
            }
          </tbody>
        </table>

        <!-- Totals Section -->
        ${
          showTotals
            ? `
        <div class="totals">
          <div style="font-size: 12px;">
            <p>SubTotal: ₹${parseFloat(totals.amountWithoutGSTItems || 0).toFixed(2)}</p>
            <p>CGST items: ₹${parseFloat(totals.cgstItems || 0).toFixed(2)}</p>
            <p>SGST items: ₹${parseFloat(totals.sgstItems || 0).toFixed(2)}</p>
            <p>Total Purchase Amount: ₹${parseFloat(totals.totalPurchaseAmount || 0).toFixed(2)}</p>
            <p>Transportation Charges: ₹${parseFloat(totals.transportationCharges || 0).toFixed(2)}</p>
            <p>Unloading Charges: ₹${parseFloat(totals.unloadingCharge || 0).toFixed(2)}</p>
            <p>Insurance: ₹${parseFloat(totals.insurance || 0).toFixed(2)}</p>
            <p>Damage Price: ₹${parseFloat(totals.damagePrice || 0).toFixed(2)}</p>
            <p>Total Other Expenses: ₹${parseFloat(totals.totalOtherExpenses || 0).toFixed(2)}</p>
            <p>Grand Total Purchase Amount: ₹${parseFloat(totals.grandTotalPurchaseAmount || 0).toFixed(2)}</p>
          </div>
        </div>
        `
            : ``
        }

        <!-- Authorised Signatory Section -->
        ${
          showTotals
            ? `
        <div class="payment-instructions">
          <p><strong>Authorised Signatory:</strong></p>
          <p style="margin-top: 40px;">Date: ____________________________</p>
          <p style="font-weight: bold; text-align: center; margin-top: 20px;">KK TRADING</p>
        </div>
        `
            : ``
        }
      </div>
    `;

    // Generate the full HTML content
    let combinedHTMLContent = '';
    for (let i = 0; i < totalPages; i++) {
      const productsChunk = productList.slice(i * productsPerPage, (i + 1) * productsPerPage);
      const showTotals = i === totalPages - 1;
      combinedHTMLContent += generatePageHTML(productsChunk, i + 1, totalPages, showTotals);
    }

    const fullHTMLContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KK PURCHASE INVOICE - ${invoiceNo}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
          }
          body {
            background-color: #f9f9f9;
          }
          .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: 20px auto;
            page-break-after: always;
          }
          .header {
            background-color: #960101; /* Dark Red */
            padding: 10px 20px;
            color: #fff;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
          }
          .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
          }
          .invoice-info div {
            font-size: 14px;
            color: #333;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 14px;
          }
          .invoice-table td {
            padding: 10px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 12px;
          }
          .totals {
            margin-top: 20px;
            text-align: right;
          }
          .totals p {
            margin: 5px 0;
            font-size: 14px;
          }
          .totals span {
            font-weight: bold;
            color: #960101;
          }
          .payment-instructions {
            margin-top: 30px;
          }
          .qr-code-section img {
            width: 80px;
            height: 80px;
          }
          footer {
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
          }

          @media print {
            body * {
              visibility: hidden;
            }
            #printable, #printable * {
              visibility: visible;
            }
            #printable {
              position: absolute;
              left: 0;
              top: 0;
            }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body>
        <div id="printable">
          ${combinedHTMLContent}
        </div>
      </body>
      </html>
    `;

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating purchase invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



printRouter.post('/verify-qr-code', async (req, res) => {
  try {
    const { qrcodeId } = req.body;

    if (!qrcodeId) {
      return res.status(400).json({ verified: false, message: 'qrcodeId is required' });
    }

    // Find the QR code in the database
    const qrCodeEntry = await QrCodeDB.findOne({ qrcodeId: qrcodeId });

    if (qrCodeEntry) {
      // QR code is found; it's our company's bill
      return res.status(200).json({
        verified: true,
        message: 'This is our company\'s bill.',
        billId: qrCodeEntry.billId,
      });
    } else {
      // QR code not found; it's not our company's bill
      return res.status(404).json({
        verified: false,
        message: 'This is not our company\'s bill.',
      });
    }
  } catch (error) {
    console.error('Error verifying QR Code:', error);
    res.status(500).json({ verified: false, message: 'Internal Server Error' });
  }
});





printRouter.post('/generate-return-invoice-html', async (req, res) => {
  try {
    const { returnNo } = req.body;

    // Validate required field
    if (!returnNo) {
      return res.status(400).json({ error: 'returnNo is required' });
    }

    // Fetch the return data from the database
    const returnData = await Return.findOne({ returnNo });

    if (!returnData) {
      return res.status(404).json({ error: 'Return data not found' });
    }

    // Generate QR Code as Data URL
    const NewQrCodeId = `${returnNo}-${Date.now()}`;

    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: returnNo,
      });

      await qrcodeDb.save();
    }

    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Generate the HTML content
    const htmlContent = generateReturnInvoiceHTML(returnData, qrCodeDataURL);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error generating return invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to generate the return invoice HTML
function generateReturnInvoiceHTML(returnData, qrCodeDataURL) {
  const returnNo = safeGet(returnData.returnNo);
  const billingNo = safeGet(returnData.billingNo);
  const returnDate = safeGet(returnData.returnDate);
  const customerName = safeGet(returnData.customerName);
  const customerAddress = safeGet(returnData.customerAddress);
  const products = Array.isArray(returnData.products) ? returnData.products : [];
  const returnAmount = parseFloat(safeGet(returnData.returnAmount, 0));
  const totalTax = parseFloat(safeGet(returnData.totalTax, 0));
  const netReturnAmount = parseFloat(safeGet(returnData.netReturnAmount, 0));

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK Trading - Return Invoice</title>
    <style>
      /* CSS styles */
      body {
        font-family: Arial, sans-serif;
      }
      .invoice {
        max-width: 800px;
        margin: auto;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 10px;
      }
      .header {
        text-align: center;
        background-color: #960101; /* Dark Red */
        color: #fff;
        padding: 20px;
        border-top-left-radius: 10px;
        border-top-right-radius: 10px;
      }
      .header h1 {
        margin-bottom: 5px;
      }
      .invoice-info, .customer-info {
        margin-top: 20px;
      }
      .invoice-info div, .customer-info div {
        margin-bottom: 5px;
      }
      .qr-code {
        text-align: right;
        margin-top: -100px;
      }
      .products-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      .products-table th, .products-table td {
        border: 1px solid #ddd;
        padding: 8px;
      }
      .products-table th {
        background-color: #f4cccc; /* Light Red */
        color: #960101; /* Dark Red */
      }
      .totals {
        margin-top: 20px;
        text-align: right;
        font-size: 16px;
      }
      .totals p {
        margin: 5px 0;
      }
      footer {
        text-align: center;
        margin-top: 20px;
        font-size: 12px;
        color: #777;
      }
@media print {
    body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        text-align: center; /* Ensure all text is centered */
    }

    .invoice {
        margin: 0 auto; /* Center the invoice horizontally */
        width: 100%; /* Adjust width as needed */
        max-width: 800px; /* Set a maximum width for the printed content */
        padding: 20px;
        border: none; /* Remove any borders to look clean */
        box-shadow: none; /* Remove shadows */
        page-break-inside: avoid; /* Avoid page breaks inside the invoice */
    }

    .header, .footer {
        text-align: center;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: auto; /* Center the table */
    }

    th, td {
        padding: 8px;
        border: 1px solid #ddd;
    }
}

    </style>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </head>
  <body>
    <div class="invoice">
      <div class="header">
        <h1>KK TRADING</h1>
        <p>Tiles, Granites, Sanitary Wares, UV Sheets</p>
      </div>
      <div class="qr-code">
        <img src="${qrCodeDataURL}" alt="QR Code" width="100" height="100" />
      </div>
      <div class="invoice-info">
        <div><strong>Return Invoice No:</strong> ${returnNo}</div>
        <div><strong>Billing No:</strong> ${billingNo}</div>
        <div><strong>Return Date:</strong> ${new Date(returnDate).toLocaleDateString()}</div>
      </div>
      <div class="customer-info">
        <div><strong>Customer Name:</strong> ${customerName}</div>
        <div><strong>Customer Address:</strong> ${customerAddress}</div>
      </div>
      <table class="products-table">
        <thead>
          <tr>
            <th>Sl</th>
            <th>Item ID</th>
            <th>Name</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${
            products.length > 0
              ? products
                  .map(
                    (product, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${safeGet(product.item_id)}</td>
                <td>${safeGet(product.name)}</td>
                <td>${safeGet(product.quantity)}</td>
              </tr>
            `
                  )
                  .join('')
              : '<tr><td colspan="4">No products returned.</td></tr>'
          }
        </tbody>
      </table>
      <div class="totals">
        <p><strong>Return Amount:</strong> ₹${returnAmount.toFixed(2)}</p>
        <p><strong>Total Tax:</strong> ₹${totalTax.toFixed(2)}</p>
        <p><strong>Net Return Amount:</strong> ₹${netReturnAmount.toFixed(2)}</p>
      </div>
      <footer>
        <p>Thank you for your business!</p>
      </footer>
    </div>
  </body>
  </html>
  `;
}


printRouter.post('/generate-loading-slip-pdf', async (req, res) => {
  const {
    invoiceNo,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    salesmanName,
    invoiceDate,
    expectedDeliveryDate,
    deliveryStatus,
    billingAmountReceived,
    payments = [],
    deliveries = [],
    products = [],
  } = req.body || {};

  if (!invoiceNo || !Array.isArray(products)) {
    return res.status(400).json({ error: 'invoiceNo and products are required' });
  }

  // Extract and format delivery dates
  const deliveryDates = deliveries
    .filter(d => d && d.startLocations && d.startLocations.length > 0)
    .map(d => d.startLocations[0].timestamp)
    .filter(date => date)
    .sort((a, b) => new Date(a) - new Date(b))
    .map(date => new Date(date).toLocaleDateString());

  // Format payment details
  const totalAmountPaid = billingAmountReceived || 0;
  const paymentDetails = payments.map((p) => {
    return `Paid: Rs. ${parseFloat(p.amount).toFixed(2)}, Method: ${safeGet(p.method)}, Ref: ${safeGet(p.referenceId)}, Date: ${p.date ? new Date(p.date).toLocaleDateString() : 'N/A'}`;
  });

  const productsPerPage = 15; // Adjust as needed
  const totalPages = Math.ceil(products.length / productsPerPage);

  const generatePageHTML = (productsChunk, pageNumber, totalPages) => {
    let rowsHTML = productsChunk.map((product, index) => {
      const slNo = index + 1 + (pageNumber - 1) * productsPerPage;

      const quantity = parseInt(product.quantity, 10) || 0;
      const deliveredQuantity = parseInt(product.deliveredQuantity, 10) || 0;
      const psRatio = parseInt(product.psRatio, 10) || 1;
      const remainingQuantity = quantity - deliveredQuantity;

      if (psRatio > 1) {
        // Calculate boxes and pieces for ordered
        const oBoxes = Math.floor(quantity / psRatio);
        const oPieces = quantity % psRatio;

        // Calculate boxes and pieces for delivered
        const dBoxes = Math.floor(deliveredQuantity / psRatio);
        const dPieces = deliveredQuantity % psRatio;

        // Calculate boxes and pieces for remaining
        const rBoxes = Math.floor(remainingQuantity / psRatio);
        const rPieces = remainingQuantity % psRatio;

        return `
          <tr>
            <td>${slNo}</td>
            <td>${safeGet(product.item_id)}</td>
            <td>${safeGet(product.name)}</td>
            <!-- Ordered -->
            <td>${oBoxes}</td>
            <td>${oPieces}</td>
            <td>${(oBoxes * psRatio) + oPieces}</td>
            <!-- Delivered -->
            <td>${dBoxes}</td>
            <td>${dPieces}</td>
            <td>${(dBoxes * psRatio) + dPieces}</td>
            <!-- Remaining -->
            <td>${rBoxes}</td>
            <td>${rPieces}</td>
            <td>${(rBoxes * psRatio) + rPieces}</td>
          </tr>
        `;
      } else {
        // psRatio = 1, show as single numbers
        return `
          <tr>
            <td>${slNo}</td>
            <td>${safeGet(product.item_id)}</td>
            <td>${safeGet(product.name)}</td>
            <td>${quantity}</td>
            <td>${deliveredQuantity}</td>
            <td>${remainingQuantity}</td>
          </tr>
        `;
      }
    }).join('');

    // If no products
    if (productsChunk.length === 0) {
      rowsHTML = '<tr><td colspan="12">No Products</td></tr>';
    }

    // Determine table header based on psRatio of the first product in the chunk (assuming consistent psRatio usage)
    let tableHeaders = '';
    const firstProduct = productsChunk[0];
    const firstPsRatio = firstProduct ? parseInt(firstProduct.psRatio, 10) || 1 : 1;

    if (firstPsRatio > 1) {
      tableHeaders = `
        <tr>
          <th rowspan="2">Sl</th>
          <th rowspan="2">Item ID</th>
          <th rowspan="2">Product Name</th>
          <th colspan="3">Ordered</th>
          <th colspan="3">Delivered</th>
          <th colspan="3">Remaining</th>
        </tr>
        <tr>
          <th>Boxes</th>
          <th>Pcs</th>
          <th>Total Pcs</th>
          <th>Boxes</th>
          <th>Pcs</th>
          <th>Total Pcs</th>
          <th>Boxes</th>
          <th>Pcs</th>
          <th>Total Pcs</th>
        </tr>
      `;
    } else {
      tableHeaders = `
        <tr>
          <th>Sl</th>
          <th>Item ID</th>
          <th>Product Name</th>
          <th>Ordered</th>
          <th>Delivered</th>
          <th>Remaining</th>
        </tr>
      `;
    }

    return `
    <div class="loading-slip">
      <!-- Header Section -->
      <div class="header">
        <h1>KK TRADING</h1>
        <p class="sub-header">Tiles, Granites, Sanitary Wares, UV Sheets</p>
      </div>

      <!-- Delivery & Payment Info -->
      <div class="info-section">
        <div class="left-info">
          <p><strong>Loading Slip For Invoice:</strong> ${safeGet(invoiceNo)}</p>
          <p><strong>Invoice Date:</strong> ${new Date(invoiceDate).toLocaleDateString()}</p>
          <p><strong>Expected Delivery:</strong> ${new Date(expectedDeliveryDate).toLocaleDateString()}</p>
          <p><strong>Salesman:</strong> ${safeGet(salesmanName)}</p>
          <p><strong>Marketed By:</strong> ${safeGet(marketedBy)}</p>
          <p><strong>Delivery Status:</strong> ${safeGet(deliveryStatus)}</p>
        </div>
        <div class="right-info">
          <p><strong>Customer:</strong> ${safeGet(customerName)}</p>
          <p>${safeGet(customerAddress)}</p>
          <p>Contact: ${safeGet(customerContactNumber)}</p>
          <p><strong>Delivery Dates:</strong> ${deliveryDates.length > 0 ? deliveryDates.join(', ') : 'N/A'}</p>
          <p><strong>Total Paid:</strong> Rs. ${parseFloat(totalAmountPaid).toFixed(2)}</p>
        </div>
      </div>

      <div class="loading-slip-title">
        <h2>LOADING SLIP</h2>
      </div>

      <!-- Payment Details Section -->
      <div class="payment-details">
        <p><strong>Payment Details:</strong></p>
        ${
          paymentDetails.length > 0
          ? paymentDetails.map(pd => `<p>${pd}</p>`).join('')
          : '<p>No payment details available.</p>'
        }
      </div>

      <!-- Products Table -->
      <table class="products-table">
        <thead>
          ${tableHeaders}
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <div class="footer-section">
        <p>Page ${pageNumber} of ${totalPages}</p>
        <p class="disclaimer">
        KK TRADING - loading Slip of ${invoiceNo}
        </p>
      </div>
    </div>
    `;
  };

  // Generate the full HTML content for all pages
  let combinedHTMLContent = '';
  for (let i = 0; i < totalPages; i++) {
    const productsChunk = products.slice(i * productsPerPage, (i + 1) * productsPerPage);
    combinedHTMLContent += generatePageHTML(productsChunk, i + 1, totalPages);
  }

  const fullHTMLContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Loading Slip - ${invoiceNo}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f9f9f9;
            margin: 0;
            padding: 0;
            font-size: 10px;
          }
          .loading-slip {
            background-color: #fff;
            width: 95%;
            max-width: 1000px;
            margin: 20px auto;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
            page-break-after: always;
          }
          .header {
            background-color: #960101; /* Dark Red */
            padding: 10px;
            color: #fff;
            text-align: center;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
          }
          .header h1 {
            margin-bottom: 5px;
            font-size: 16px;
            font-weight: bold;
          }
          .sub-header {
            font-size: 10px;
            font-weight: 700;
          }
          .info-section {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0e0e0;
          }
          .info-section .left-info, .info-section .right-info {
            width: 48%;
          }
          .info-section p {
            margin: 2px 0;
          }
          .loading-slip-title {
            text-align: center;
            margin-top: 10px;
          }
          .loading-slip-title h2 {
            font-size: 12px;
            color: #960101;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .payment-details {
            margin-top: 10px;
            font-size: 9px;
            line-height: 1.2em;
          }
          .payment-details p {
            margin: 2px 0;
          }
          .products-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 9px;
          }
          .products-table th {
            background-color: #f4cccc;
            color: #960101;
            padding: 4px;
            border: 1px solid #ddd;
            text-align: center;
          }
          .products-table td {
            padding: 4px;
            text-align: center;
            border: 1px solid #ddd;
            color: #333;
            font-size: 9px;
          }
          .footer-section {
            text-align: center;
            margin-top: 10px;
            font-size: 8px;
            color: #777;
          }
          .footer-section .disclaimer {
            font-style: italic;
            margin-top: 5px;
          }

          @media print {
            body {
              margin:0;
              padding:0;
            }
            .loading-slip {
              page-break-after: always;
            }
            .footer-section {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        ${combinedHTMLContent}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  try {
    // Optionally, save the loading slip HTML to a file or log if needed
    // Generate QR Code as Data URL (if needed)
    // const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId); // Adjust as per requirement

    // Send the HTML directly with print onload
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.log('Error generating Loading Slip HTML:', error);
    res.status(500).json(error);
  }
});


printRouter.post('/generate-leave-application-pdf', async (req, res) => {
  const { 
    userName,
    userId,
    reason,
    startDate,
    endDate,
    status,
    _id 
  } = req.body;

  const today = new Date().toLocaleDateString();
  const formattedStartDate = new Date(startDate).toLocaleDateString();
  const formattedEndDate = new Date(endDate).toLocaleDateString();

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Leave Application</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        font-size: 12px;
        margin: 30px;
        color: #333;
      }

      .header {
        text-align: center;
        margin-bottom: 20px;
      }

      .header h1 {
        margin-bottom: 5px;
        font-size: 16px;
        font-weight: bold;
        color: #960101;
      }

      .header p {
        margin: 2px 0;
        font-size: 10px;
        color: #555;
      }

      hr {
        margin: 10px 0;
        border: none;
        border-top: 1px solid #ccc;
      }

      .date {
        text-align: right;
        margin-bottom: 20px;
        font-size: 10px;
      }

      .content {
        line-height: 1.5;
      }

      .content p {
        margin-bottom: 10px;
      }

      .signature {
        margin-top: 50px;
      }

      .signature-line {
        margin-bottom: 5px;
        width: 200px;
        border-bottom: 1px solid #333;
      }

      footer {
        text-align: center;
        font-size: 8px;
        color: #999;
        margin-top: 50px;
      }
    </style>
    <script>
      window.onload = () => {
        window.print();
      };
    </script>
  </head>
  <body>
    <div class="header">
      <h1>KK TRADING</h1>
      <p>Chambakulam, Moncompu</p>
      <p>Contact: 8606565282 | tradeinkk@gmail.com</p>
      <hr>
    </div>

    <div class="date">
      <p>Date: ${today}</p>
    </div>

    <div class="content">
      <p><strong>Subject:</strong> Leave Application</p>
      <p><strong>Name:</strong> ${userName}</p>
      <p><strong>User ID:</strong> ${userId}</p>
      <p><strong>Reason for Leave:</strong> ${reason}</p>
      <p><strong>Start Date:</strong> ${formattedStartDate}</p>
      <p><strong>End Date:</strong> ${formattedEndDate}</p>
      <p><strong>Status:</strong> ${status}</p>

      <p>I kindly request your approval for the leave period stated above. I assure that any pending responsibilities will be managed or delegated appropriately during my absence. I will resume my duties promptly upon my return.</p>
    </div>

    <div class="signature">
      <div class="signature-line"></div>
      <p>Signature of Applicant</p>
    </div>

    <footer>
      <p>KK Trading - Leave Letter</p>
    </footer>
  </body>
  </html>
  `;

  // Return the HTML directly
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlContent);
});













export default printRouter;