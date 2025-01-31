// routes/siteReportRoutes.js
import express from 'express';
import SiteReport from '../models/siteReportModal.js';

const siteReportRouter = express.Router();

// Create a new site report
siteReportRouter.post('/', async (req, res) => { 
  try {
    const report = new SiteReport({
      siteName: req.body.siteName,
      address: req.body.address,
      customerName: req.body.customerName,
      customerContactNumber: req.body.customerContactNumber,
      contractorName: req.body.contractorName,
      contractorContactNumber: req.body.contractorContactNumber,
      siteDetails: req.body.siteDetails,
      remarks: req.body.remarks,
      submittedBy: req.body.submittedBy,
      location: req.body.location,
      image: req.body.image
    });

    const createdReport = await report.save();
    res.status(201).send({ message: 'Site Report Created', report: createdReport });
  } catch (error) {
    res.status(500).send({ message: 'Error creating site report', error: error.message });
  }
});


siteReportRouter.put('/edit/:id', async (req, res) => {
    try {
      const report = await SiteReport.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!report) return res.status(404).send({ message: 'Site report not found' });
      res.send(report);
    } catch (error) {
      res.status(500).send({ message: 'Error updating site report', error: error.message });
    }
});

siteReportRouter.put('/visited/:id', async (req, res) => {
    try {
      const report = await SiteReport.findByIdAndUpdate(req.params.id, { visited: req.body.visited }, { new: true });
      if (!report) return res.status(404).send({ message: 'Site report not found' });
      res.send(report);
    } catch (error) {
      res.status(500).send({ message: 'Error updating site report', error: error.message });
    }
})

// Get all site reports
siteReportRouter.get('/', async (req, res) => {
  try {
    const reports = await SiteReport.find({});
    res.send(reports);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching site reports', error: error.message });
  }
});


siteReportRouter.get('/edit/:id', async (req, res) => {
    try {
      const reports = await SiteReport.findById(req.params.id);
      res.send(reports);
    } catch (error) {
      res.status(500).send({ message: 'Error fetching site reports', error: error.message });
    }
  });

export default siteReportRouter;
