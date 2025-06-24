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
import xlsx from 'xlsx'; // Use 'xlsx' import for ES modules

import mongoose from 'mongoose';

const printRouter = express.Router();



// Helper function to safely get values or return "N/A" if undefined
const safeGet = (value) => (value ? value : ' ');

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
    // 1. Extract incoming fields from request body
    let {
      invoiceNo,
      invoiceDate,
      salesmanName,
      salesmanPhoneNumber,
      expectedDeliveryDate,
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
      roundOff,
      grandTotal,
      products,
      printOptions,     // Front-end column checklist
      paymentAmount,     // single payment amount from the front end (fallback)
      paymentReceivedDate,
    } = safeGet(req.body, '');



    // If no invoiceNo, can't proceed
    if (!invoiceNo) {
      return res.status(400).json({ error: 'invoiceNo is required' });
    }

    // Convert numeric fields from request body (fallback values)
    billingAmount   = parseFloat(billingAmount)   || 0;
    subTotal        = parseFloat(subTotal)        || 0;
    discount        = parseFloat(discount)        || 0;
    transportation  = parseFloat(transportation)  || 0;
    unloading       = parseFloat(unloading)       || 0;
    handling        = parseFloat(handling)        || 0;
    roundOff        = parseFloat(roundOff)        || 0;
    grandTotal      = parseFloat(grandTotal)      || 0;

    // 2. Attempt to find the Billing document by invoiceNo
    const billingDoc = await Billing.findOne({ invoiceNo });

    // 3. Prepare final variables (will be pulled from DB if doc found, otherwise fallback to request)
    let finalInvoiceDate             = invoiceDate;
    let finalSalesmanName            = salesmanName;
    let finalSalesmanPhoneNumber     = salesmanPhoneNumber;
    let finalExpectedDeliveryDate    = expectedDeliveryDate;
    let finalCustomerName            = customerName;
    let finalCustomerAddress         = customerAddress;
    let finalCustomerContactNumber   = customerContactNumber;
    let finalMarketedBy              = marketedBy;
    let finalBillingAmount           = billingAmount;
    let finalSubTotal                = subTotal;
    let finalDiscount                = discount;
    let finalTransportation          = transportation;
    let finalUnloading               = unloading;
    let finalHandling                = handling;
    let finalRoundOff                = roundOff;
    let finalGrandTotal              = grandTotal;
    let finalProducts                = Array.isArray(products) ? products : [];
    let finalDeliveryStatus          = "Not Delivered"; // fallback if no doc
    let totalPaymentReceived         = 0;
    let lastPaymentDate              = null;

    if (billingDoc) {
      // Override fields from DB
      // finalInvoiceDate             = billingDoc.invoiceDate;
      // finalSalesmanName            = billingDoc.salesmanName;
      // finalSalesmanPhoneNumber     = billingDoc.salesmanPhoneNumber;
      // finalExpectedDeliveryDate    = billingDoc.expectedDeliveryDate;
      // finalCustomerName            = billingDoc.customerName;
      // finalCustomerAddress         = billingDoc.customerAddress;
      // finalCustomerContactNumber   = billingDoc.customerContactNumber;
      // finalMarketedBy              = billingDoc.marketedBy;
      // finalBillingAmount           = billingDoc.billingAmount;
      // finalSubTotal                = billingDoc.billingAmount; // or separate if you store subTotal differently
      // finalDiscount                = billingDoc.discount;
      // finalTransportation          = billingDoc.transportation;
      // finalUnloading               = billingDoc.unloading;
      // finalHandling                = billingDoc.handlingCharge || 0;
      // finalRoundOff                = billingDoc.roundOff;
      // finalGrandTotal              = billingDoc.grandTotal;
      // finalProducts                = billingDoc.products || [];

      // Delivery status directly from the doc
      finalDeliveryStatus = billingDoc.deliveryStatus || 'Pending';

      // Compute payment from doc’s payments array
      if (Array.isArray(billingDoc.payments) && billingDoc.payments.length > 0) {
        billingDoc.payments.forEach((p) => {
          totalPaymentReceived += parseFloat(p.amount) || 0;
          const pDate = new Date(p.date);
          if (!lastPaymentDate || pDate > lastPaymentDate) {
            lastPaymentDate = pDate;
          }
        });
      }
    }

    // If no doc or doc has no payments, fallback to single payment info from request
    if (totalPaymentReceived === 0) {
      totalPaymentReceived = parseFloat(paymentAmount) || 0;
      lastPaymentDate = paymentReceivedDate ? new Date(paymentReceivedDate) : null;
    }

    const lastPaymentDateStr = lastPaymentDate
      ? lastPaymentDate.toLocaleDateString()
      : '-';

    // If we do NOT have a billingDoc (meaning we got no official deliveryStatus),
    // we fallback to computing from products:
    if (!billingDoc) {
      if (finalProducts.length > 0) {
        const allDelivered = finalProducts.every(p => p.deliveryStatus === "Delivered");
        const anyDelivered = finalProducts.some(
          p => p.deliveryStatus === "Delivered" || p.deliveryStatus === "Partially Delivered"
        );
        if (allDelivered) {
          finalDeliveryStatus = "Fully Delivered";
        } else if (anyDelivered) {
          finalDeliveryStatus = "Partially Delivered";
        }
      }
    }

    // 4. Prepare pagination variables (10 items per page)
    const productsPerPage = 10;
    const totalPages = Math.ceil(finalProducts.length / productsPerPage) || 1;

    // 5. Generate a new QR code ID and store in DB
    const NewQrCodeId = `${invoiceNo}-${Date.now()}`;
    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: invoiceNo,
      });
      await qrcodeDb.save();
    }
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // 6. Set default print options if not provided
    printOptions = printOptions || {
      showItemId: true,
      showItemName: true,
      showItemRemark: true, // if your front-end is sending a separate toggle
      showQuantity: true,
      showUnit: true,
      showPrice: true,
      showRate: true,
      showGst: true,
      showCgst: true,
      showSgst: true,
      showDiscount: true,
      showNetAmount: true,
      showPaymentDetails: true,
    };

    // 7. Helper to compute per-product fields
    const computeProductFields = (product) => {
      const qty = parseFloat(product.quantity) || 0;
      const priceInQty = parseFloat(product.sellingPriceinQty) || 0;
      const itemBase = qty * priceInQty;

      // Compute the sum of bases for discount distribution
      let sumOfBase = 0;
      finalProducts.forEach((p) => {
        sumOfBase += (parseFloat(p.quantity) || 0) * (parseFloat(p.sellingPriceinQty) || 0);
      });

      const discountRatio = sumOfBase > 0 ? (parseFloat(discount) || 0) / sumOfBase : 0;
      const itemDiscount = itemBase * discountRatio;
      const gstRate = parseFloat(product.gstRate) || 0;
      const rateWithoutGST = itemBase / (1 + gstRate / 100) - itemDiscount;
      const gstAmount = rateWithoutGST * (gstRate / 100);
      const cgst = gstAmount / 2;
      const sgst = gstAmount / 2;
      const netTotal = rateWithoutGST + gstAmount;

      return {
        baseTotal: itemBase,
        discountAmt: itemDiscount,
        rateWithoutGST,
        gstRate,
        gstAmount,
        cgst,
        sgst,
        netAmount: netTotal,
      };
    };

    // 8. Build table header row based on printOptions
    const buildHeaderRow = () => {
      let header = '<tr><th>Sl</th>';

      if (printOptions.showItemId) {
        header += '<th>Item Id</th>';
      }

      // We combine item name + remark in one column if either is enabled
      if (printOptions.showItemName || printOptions.showItemRemark) {
        header += '<th>Item</th>';
      }

      if (printOptions.showQuantity) {
        header += '<th>Qty</th>';
      }
      if (printOptions.showUnit) {
        header += '<th>Unit</th>';
      }
      if (printOptions.showPrice) {
        header += '<th>Price</th>';
      }
      if (printOptions.showRate) {
        header += '<th>Rate</th>';
      }
      if (printOptions.showGst) {
        header += '<th>GST %</th>';
      }
      if (printOptions.showCgst) {
        header += '<th>CGST</th>';
      }
      if (printOptions.showSgst) {
        header += '<th>SGST</th>';
      }
      if (printOptions.showDiscount) {
        header += '<th>Disc</th>';
      }
      if (printOptions.showNetAmount) {
        header += '<th>Net Amount</th>';
      }

      header += '</tr>';
      return header;
    };

    // 9. Build a single product row
    const buildProductRow = (product, index, pageNumber) => {
      const {
        rateWithoutGST,
        gstRate,
        cgst,
        sgst,
        discountAmt,
        netAmount,
      } = computeProductFields(product);
    
      let row = `<tr><td>${index + 1 + (pageNumber - 1) * productsPerPage}</td>`;

      if (printOptions.showItemId) {
        row += `<td>${safeGet(product.item_id)}</td>`;
      }

      // Combine item name + remark in one column
      if (printOptions.showItemName || printOptions.showItemRemark) {
        const itemNameText = safeGet(product.name);
        const itemRemarkText = safeGet(product.itemRemark, '');  
        let nameCell = '';

        // If showItemName is true and there's a name, show it in bold
        if (printOptions.showItemName && itemNameText) {
          nameCell += `<div style="font-weight:bold;">${itemNameText}</div>`;
        }

        // If showItemRemark is true and there's a remark, show it under or alone
        if (printOptions.showItemRemark && itemRemarkText) {
          if (nameCell) {
            // we already have the itemName in bold, so show remark in smaller font
            nameCell += `<div style="font-size:11px; margin-top:2px;">${itemRemarkText}</div>`;
          } else {
            // no itemName, so just show remark in bold
            nameCell = `<div style="font-weight:bold;">${itemRemarkText}</div>`;
          }
        }

        // Fallback if nameCell is empty
        if (!nameCell) {
          nameCell = '-';
        }

        row += `<td>${nameCell}</td>`;
      }

      if (printOptions.showQuantity) {
        row += `<td>${safeGet(product.enteredQty)}</td>`;
      }
      if (printOptions.showUnit) {
        row += `<td>${safeGet(product.unit)}</td>`;
      }
      if (printOptions.showPrice) {
        // sellingPrice or fallback 0
        const priceVal = parseFloat(product.sellingPrice) || 0;
        row += `<td>₹${priceVal.toFixed(2)}</td>`;
      }
      if (printOptions.showRate) {
        row += `<td>₹${rateWithoutGST.toFixed(2)}</td>`;
      }
      if (printOptions.showGst) {
        row += `<td>${gstRate}%</td>`;
      }
      if (printOptions.showCgst) {
        row += `<td>₹${cgst.toFixed(2)}</td>`;
      }
      if (printOptions.showSgst) {
        row += `<td>₹${sgst.toFixed(2)}</td>`;
      }
      if (printOptions.showDiscount) {
        row += `<td>₹${discountAmt.toFixed(2)}</td>`;
      }
      if (printOptions.showNetAmount) {
        row += `<td>₹${netAmount.toFixed(2)}</td>`;
      }

      row += '</tr>';
      return row;
    };

    // Before generating pages, recalc totals from the products (ignoring frontend subTotal)
    // Compute the total amount of products without GST and the total GST.
    let computedSubtotal = 0;
    let computedTotalGST = 0;

    let sumOfBase = 0;
    finalProducts.forEach((p) => {
      sumOfBase += (parseFloat(p.quantity) || 0) * (parseFloat(p.sellingPriceinQty) || 0);
    });

    finalProducts.forEach(product => {
      const qty = parseFloat(product.quantity) || 0;
      const priceInQty = parseFloat(product.sellingPriceinQty) || 0;
      const gstRate = parseFloat(product.gstRate) || 0;
      const discountRatio = sumOfBase > 0 ? (parseFloat(discount) || 0) / sumOfBase : 0;
      const itemDiscount = (qty * priceInQty) * discountRatio;
      const amountWithoutGST = (qty * priceInQty) / (1 + gstRate / 100) - itemDiscount;
      computedSubtotal += amountWithoutGST;
      const productGST = amountWithoutGST * (gstRate / 100);
      computedTotalGST += productGST;
    });

    const computedGrandTotal = computedSubtotal + computedTotalGST + finalTransportation + finalUnloading + finalHandling - finalRoundOff;

    // 10. Generate HTML for a single invoice page
    const generatePageHTML = (productsChunk, pageNumber, totalPages, showTotals) => {
      const headerRow = buildHeaderRow();
      const rows = productsChunk
        .map((product, index) => buildProductRow(product, index, pageNumber))
        .join('');

      // Payment info table from the *final* computed totals
      const paymentInfoTable = `
        <table class="payment-table">
          <thead>
            <tr>
              <th>Total Payment Received</th>
              <th>Last Payment Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>₹${totalPaymentReceived.toFixed(2)}</td>
              <td>${lastPaymentDateStr}</td>
            </tr>
          </tbody>
        </table>
      `;

      // Updated Totals table (removing discount column and adding total GST)
      const totalsTable = `
        <table class="totals-table">
          <thead>
            <tr>
              <th>Subtotal</th>
              <th>Total GST</th>
              <th>Transportation</th>
              <th>Unloading</th>
              <th>Handling</th>
              <th>Round Off</th>
              <th>Grand Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>₹${computedSubtotal.toFixed(2)}</td>
              <td>₹${computedTotalGST.toFixed(2)}</td>
              <td>₹${finalTransportation.toFixed(2)}</td>
              <td>₹${finalUnloading.toFixed(2)}</td>
              <td>₹${finalHandling.toFixed(2)}</td>
              <td>${finalRoundOff.toFixed(2)}</td>
              <td style="font-weight:bold;font-size: 14px;">₹${grandTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      `;

      // Delivery status from finalDeliveryStatus
      const deliveryStatusSection = `
        <div class="delivery-status" style="margin-top:10px; font-size:13px; text-align:right;">
          <strong>Delivery Status:</strong> ${finalDeliveryStatus}
        </div>
      `;

      const invoiceInfoBlock = pageNumber === 1
    ? `
    <div class="invoice-info">
      <div class="info-left">
        <p><strong>Est no.:</strong> ${invoiceNo}</p>
        <p><strong>Invoice Date:</strong> ${
          finalInvoiceDate ? new Date(finalInvoiceDate).toLocaleDateString() : '-'
        }</p>
        <p><strong>Expected Delivery:</strong> ${
          finalExpectedDeliveryDate ? new Date(finalExpectedDeliveryDate).toLocaleDateString() : '-'
        }</p>
        <p><strong>Salesman:</strong> ${finalSalesmanName || '-'}</p>
        <p><strong>Salesman Contact:</strong> ${finalSalesmanPhoneNumber || '-'}</p>
        <p><strong>Marketed By:</strong> ${finalMarketedBy || '-'}</p>
      </div>
      <div class="info-right" style="text-align:right;">
        <p><strong>From:</strong></p>
        <p>KK TRADING</p>
        <p>Moncompu, Chambakulam, Alappuzha</p>
        <p>Alappuzha, 688503</p>
        <p><strong>Contact:</strong> 0477 2080282</p>
        <p><strong>Email:</strong> tradeinkk@gmail.com</p>
        <img
          src="${qrCodeDataURL}"
          alt="QR Code"
          style="width:60px; height:60px; margin-top:10px;"
        />
      </div>
    </div>
    
              <div class="invoice-info">
            <div class="customer-info">
              <p><strong>Bill To:</strong></p>
              <p><strong>Name:</strong> ${finalCustomerName || '-'}</p>
              <p><strong>Address:</strong> ${finalCustomerAddress || '-'}</p>
              <p><strong>Contact:</strong> ${finalCustomerContactNumber || '-'}</p>
            </div>
            <div class="payment-delivery-info" style="text-align:right;">
              ${printOptions.showPaymentDetails ? paymentInfoTable : ''}
              ${deliveryStatusSection}
            </div>
          </div>
    
    `
    : '';  

      // Return the page HTML
      return `
        <div class="invoice">
          <!-- Header -->
          <div class="header">
            <p>KK TRADING</p>
            <p style="font-size:14px; margin-top:10px;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
          </div>

          <p style="font-size:14px;margin-top:10px;text-align:center;"><strong>Estimate No:</strong> ${invoiceNo}</p>

          <!-- Invoice Info -->
       ${invoiceInfoBlock}

          <!-- Customer, Payment & Delivery Info -->


          <!-- Products Table -->
          <table class="invoice-table">
            <thead>
              ${headerRow}
            </thead>
            <tbody>
              ${
                productsChunk.length > 0
                  ? rows
                  : '<tr><td colspan="11">No Products Available</td></tr>'
              }
            </tbody>
          </table>

          <!-- Totals Table (only on last page) -->
          ${showTotals ? totalsTable : ''}

          <footer>Page ${pageNumber} of ${totalPages}</footer>
          <footer class="footer-note">
            <p style="font-size:12px; color:#444; text-align:center; margin-top:10px;">
              45 ദിവസത്തിന് ശേഷം ഉൽപ്പന്നങ്ങൾ മാറ്റി വാങ്ങാനും തിരികെ നൽകാനും കഴിയില്ല.<br>
              30 ദിവസത്തിനുള്ളിൽ ഉൽപ്പന്നങ്ങൾ തിരികേനൽകുന്നവർക്ക് മാത്രം ജിഎസ്ടി ഉൾപ്പെടെയുള്ള റീഫണ്ടുകൾ.
            </p>
          </footer>
        </div>
      `;
    };

    // 11. Generate all pages HTML
    let combinedHTMLContent = '';
    for (let i = 0; i < totalPages; i++) {
      const productsChunk = finalProducts.slice(
        i * productsPerPage,
        (i + 1) * productsPerPage
      );
      const showTotals = i === totalPages - 1; // Only show totals on last page
      combinedHTMLContent += generatePageHTML(productsChunk, i + 1, totalPages, showTotals);
    }

    // 12. Final HTML structure
    const fullHTMLContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KK Estimate</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins&display=swap" rel="stylesheet">
        <style>
          * {
            margin: 0; padding: 0; box-sizing: border-box;
            font-family: 'Poppins', sans-serif;
          }
          body {
            background-color: #f9f9f9; padding: 20px;
          }
          .invoice {
            background-color: #fff; margin: auto; padding: 20px;
            border-radius: 10px; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px; page-break-after: always;
          }
          .header {
            background-color: #960101; padding: 20px; color: #fff; text-align: center;
            font-size: 22px; font-weight: bold;
            border-top-left-radius: 10px; border-top-right-radius: 10px;
          }
          .invoice-info {
            display: flex; justify-content: space-between;
            margin-top: 15px; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;
          }
          .invoice-info div {
            font-size: 12px; color: #333; line-height: 1.6;
          }
          .invoice-table {
            width: 100%; border-collapse: collapse; margin-top: 15px;
          }
          .invoice-table th {
            background-color: #f4cccc; color: #960101; padding: 10px;
            border: 1px solid #ddd; font-size: 12px;
          }
          .invoice-table td {
            padding: 10px; text-align: center; border: 1px solid #ddd;
            font-size: 12px;
          }
          .payment-table, .totals-table {
            width: 100%; border-collapse: collapse; margin-top: 15px;
          }
          .payment-table th, .payment-table td,
          .totals-table th, .totals-table td {
            border: 1px solid #ddd; padding: 8px; text-align: center;
            font-size: 12px;
          }
          .payment-table th, .totals-table th {
            background-color: #f4cccc; color: #960101;
          }
          footer {
            text-align: center; margin-top: 20px; font-size: 12px; color: #777;
          }
          @page { margin: 20px; }
          @media print {
            body { margin: 0; }
            body * { visibility: hidden; }
            #printable, #printable * { visibility: visible; }
            #printable {
              position: absolute; left: 0; top: 0; width: 100%;
            }
            .invoice { page-break-inside: avoid; }
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

    // 13. Send the final HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


/* ----------------------------------------------------------------
   Purchase-Request → Printable HTML Letter
-----------------------------------------------------------------*/
printRouter.post('/generate-request-letter', async (req, res) => {
  try {
    // 1. Get data (body may already contain the full doc)
    const requestData =
      req.body._id ? req.body : await PurchaseRequest.findById(req.body.id);

    if (!requestData) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // 2. Build table rows
    const rows = requestData.items
      .map((it, idx) => {
        const size =
          it.size ||
          (it.length && it.breadth ? `${it.length}×${it.breadth}` : '—');
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${it.itemId || '—'}</td>
            <td>${it.name}</td>
            <td style="text-align:center;">${size}</td>
            <td style="text-align:center;">${it.quantity}</td>
            <td style="text-align:center;">${it.pUnit}</td>
          </tr>
        `;
      })
      .join('');

    // 3. Pretty-print status
    const niceStatus = requestData.status
      .replace('-', ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // 4. HTML template
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Purchase Request ${requestData._id}</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
          @page { margin: 40px; }
          *      { box-sizing: border-box; }
          body   { font-family: 'Poppins', sans-serif; color:#333; line-height:1.55; }
          
          header {
            text-align:center; border-bottom:2px solid #960101; padding-bottom:10px; margin-bottom:30px;
          }
          header h1 { margin:0; font-size:28px; font-weight:600; color:#960101; letter-spacing:1px; }
          header p  { margin:2px 0; font-size:11px; font-weight:300; }

          .meta      { display:flex; justify-content:space-between; margin-bottom:28px; font-size:12px; }
          .meta .col { width:48%; }
          .meta div  { margin-bottom:6px; }
          .meta strong { width:105px; display:inline-block; color:#960101; font-weight:600; }

          table      { width:100%; border-collapse:collapse; margin-bottom:50px; }
          th,td      { border:1px solid #ddd; padding:6px 8px; }
          th         { background:#f4cccc; color:#960101; font-weight:600; font-size:13px; }
          td         { font-size:12px; font-weight:300; }

          .signature { text-align:right; margin-top:60px; font-size:12px; }
          .signature p { display:inline-block; border-top:1px solid #333; padding-top:5px; margin:0; }

          footer { text-align:center; margin-top:80px; font-size:13px; font-weight:600; color:#960101; }

          /* avoid page-breaks in header/footer/signature */
          @media print { header, footer, .signature { page-break-inside:avoid; } }
        </style>
        <script>window.onload = () => window.print();</script>
      </head>
      <body>

        <!-- ——— Header ——— -->
        <header>
          <h1>KK&nbsp;TRADING</h1>
          <p>Tiles · Granites · Sanitary Wares · UV Sheets</p>
          <p>Moncompu, Chambakulam, Alappuzha 688503 | +91-477-2080282 | tradeinkk@gmail.com</p>
        </header>

        <!-- ——— Meta ——— -->
        <section class="meta">
          <div class="col">
            <div><strong>Request ID:</strong> ${requestData._id}</div>
            <div><strong>Date:</strong> ${new Date(
              requestData.requestDate
            ).toLocaleDateString()}</div>
            <div><strong>Status:</strong> ${niceStatus}</div>
          </div>
          <div class="col">
            <div><strong>From:</strong> ${requestData.requestFrom.name}</div>
            <div><strong>Address:</strong> ${
              requestData.requestFrom.address || '—'
            }</div>
            <div><strong>To:</strong> ${requestData.requestTo.name}</div>
            <div><strong>Address:</strong> ${
              requestData.requestTo.address || '—'
            }</div>
          </div>
        </section>

        <!-- ——— Items ——— -->
        <table>
          <thead>
            <tr>
              <th style="width:5%;">#</th>
              <th style="width:12%;">Item ID</th>
              <th>Name</th>
              <th style="width:12%;">Size</th>
              <th style="width:8%;">Qty</th>
              <th style="width:8%;">Unit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <!-- ——— Signature ——— -->
        <div class="signature">
          <p>Authorized Signature</p>
        </div>

        <footer>KK&nbsp;TRADING</footer>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    console.error('Error generating request letter:', e);
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
      // Determine if remaining is zero
      const isRemainingZero = remainingQuantity === 0;
      const checkboxAttributes = isRemainingZero 
        ? 'checked style="accent-color: red;"'
        : 'style="accent-color: initial;"';

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
            <td><input type="checkbox" ${checkboxAttributes} /></td>
            <td>${slNo}</td>
            <td>${safeGet(product.item_id)}</td>
            <td>${safeGet(product.name)}</td>
            <!-- Ordered -->
            <td class="ordered-section">${oBoxes}</td>
            <td class="ordered-section">${oPieces}</td>
            <td class="ordered-section" style="border-right:2px solid #000;">${(oBoxes * psRatio) + oPieces}</td>
            <!-- Delivered -->
            <td class="delivered-section">${dBoxes}</td>
            <td class="delivered-section">${dPieces}</td>
            <td class="delivered-section" style="border-right:2px solid #000;">${(dBoxes * psRatio) + dPieces}</td>
            <!-- Remaining -->
            <td class="remaining-section">${rBoxes}</td>
            <td class="remaining-section">${rPieces}</td>
            <td class="remaining-section"><strong>${(rBoxes * psRatio) + rPieces}</strong></td>
          </tr>
        `;
      } else {
        // For psRatio = 1, merge each section across 3 columns (keeping the 12-column structure)
        return `
          <tr>
            <td><input type="checkbox" ${checkboxAttributes} /></td>
            <td>${slNo}</td>
            <td>${safeGet(product.item_id)}</td>
            <td>${safeGet(product.name)}</td>
            <td colspan="3" style="background-color: #f8d7da; border-right:2px solid #000;">${quantity}</td>
            <td colspan="3" style="background-color: #d1e7dd; border-right:2px solid #000;">${deliveredQuantity}</td>
            <td colspan="3" style="background-color: #fff3cd;"><strong>${remainingQuantity}</strong></td>
          </tr>
        `;
      }
    }).join('');

    // If no products, adjust colspan (13 columns because of the extra checkbox column)
    if (productsChunk.length === 0) {
      rowsHTML = `<tr><td colspan="13">No Products</td></tr>`;
    }

    // Determine table header based on psRatio of the first product in the chunk
    let tableHeaders = '';
    const firstProduct = productsChunk[0];
    const firstPsRatio = firstProduct ? parseInt(firstProduct.psRatio, 10) || 1 : 1;

    if (firstPsRatio > 1) {
      // Header for products with breakdown (boxes, pcs, total)
      tableHeaders = `
        <tr>
          <th rowspan="2">Check</th>
          <th rowspan="2">Sl</th>
          <th rowspan="2">Item ID</th>
          <th rowspan="2">Product Name</th>
          <th colspan="3" class="ordered-section">Ordered</th>
          <th colspan="3" class="delivered-section">Delivered</th>
          <th colspan="3" class="remaining-section">Remaining</th>
        </tr>
        <tr>
          <th class="ordered-section">Boxes</th>
          <th class="ordered-section">Pcs</th>
          <th class="ordered-section" style="border-right:2px solid #000;">Total Pcs</th>
          <th class="delivered-section">Boxes</th>
          <th class="delivered-section">Pcs</th>
          <th class="delivered-section" style="border-right:2px solid #000;">Total Pcs</th>
          <th class="remaining-section">Boxes</th>
          <th class="remaining-section">Pcs</th>
          <th class="remaining-section">Total Pcs</th>
        </tr>
      `;
    } else {
      // Header for products without breakdown.
      tableHeaders = `
        <tr>
          <th>Check</th>
          <th>Sl</th>
          <th>Item ID</th>
          <th>Product Name</th>
          <th colspan="3" style="background-color: #f8d7da; border-right:2px solid #000;">Ordered</th>
          <th colspan="3" style="background-color: #d1e7dd; border-right:2px solid #000;">Delivered</th>
          <th colspan="3" style="background-color: #fff3cd;">Remaining</th>
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
            <p><strong>Loading Slip For Estimate:</strong> ${safeGet(invoiceNo)}</p>
            <p><strong>Estimate Date:</strong> ${new Date(invoiceDate).toLocaleDateString()}</p>
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
            KK TRADING - Loading Slip of ${invoiceNo}
          </p>
        </div>
        ${pageNumber === totalPages ? `
          <div class="customer-signatory">
            <p>Customer Signatory: ___________________________</p>
            <p>Date: ___________________________</p>
          </div>
        ` : ''}
      </div>
    `;
  };

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
            background-color: #960101;
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
          .products-table th,
          .products-table td {
            padding: 4px;
            text-align: center;
            border: 1px solid #ddd;
          }
          /* Background colours for sections */
          .ordered-section {
            background-color: #f8d7da; /* Light Red */
          }
          .delivered-section {
            background-color: #d1e7dd; /* Light Green */
          }
          .remaining-section {
            background-color: #fff3cd; /* Light Yellow */
          }
          .products-table th {
            background-color: #f4cccc;
            color: #960101;
          }
          .products-table td {
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
          .customer-signatory {
            margin-top: 20px;
            text-align: right;
            font-size: 10px;
            font-weight: bold;
          }
          @media print {
            body {
              margin: 0;
              padding: 0;
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
        ${(() => {
          let combinedHTMLContent = '';
          for (let i = 0; i < totalPages; i++) {
            const productsChunk = products.slice(i * productsPerPage, (i + 1) * productsPerPage);
            combinedHTMLContent += generatePageHTML(productsChunk, i + 1, totalPages);
          }
          return combinedHTMLContent;
        })()}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  try {
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



const flattenDocuments = (docs) => {
  const flat = [];

  for (const doc of docs) {
    const { _id, ...rest } = doc;

    let hasArray = false;

    for (const key in rest) {
      if (Array.isArray(rest[key])) {
        hasArray = true;
        const arrayField = rest[key];

        for (const item of arrayField) {
          flat.push({
            _id: _id.toString(),
            ...rest,
            ...item,
            __arrayField: key // optional: to keep track of source array
          });
        }

        break; // flatten only the first array field
      }
    }

    if (!hasArray) {
      flat.push({
        _id: _id.toString(),
        ...rest
      });
    }
  }

  return flat;
};

printRouter.get('/export', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const workbook = xlsx.utils.book_new();

    for (const collection of collections) {
      const collectionName = collection.name;

      const rawData = await mongoose.connection.db
        .collection(collectionName)
        .find({})
        .toArray();

      // Convert ObjectIds and Dates to strings for readability
      const sanitizedData = rawData.map(doc => {
        return JSON.parse(JSON.stringify(doc));
      });

      const flattened = flattenDocuments(sanitizedData);

      const worksheet = xlsx.utils.json_to_sheet(flattened);
      xlsx.utils.book_append_sheet(workbook, worksheet, collectionName);
    }

    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename=all_data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).send('Internal Server Error');
  }
});













export default printRouter;