// routes/contactRoutes.js

import express from 'express';
import Contact from '../models/ContactsModel.js';
const ContactRouter = express.Router();

// GET all contacts
ContactRouter.get('/', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json(contacts);
  } catch (error) {
    console.error('[GET /contacts] Error:', error);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
});

// GET a single contact by ID
ContactRouter.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    return res.status(200).json(contact);
  } catch (error) {
    console.error('[GET /contacts/:id] Error:', error);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
});

// POST (create) a new contact
ContactRouter.post('/', async (req, res) => {
  try {
    const { name, phoneNumber, address, submittedBy, location, bills } = req.body;

    // Basic validation
    if (!name || !phoneNumber) {
      return res.status(400).json({ message: 'Name and phone number are required.' });
    }

    const newContact = await Contact.create({
      name,
      phoneNumber,
      address,
      submittedBy,
      location,
      bills,
    });

    return res.status(201).json(newContact);
  } catch (error) {
    console.error('[POST /contacts] Error:', error);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
});

// PUT (update) a contact by ID
ContactRouter.put('/:id', async (req, res) => {
  try {
    const { name, phoneNumber, address, submittedBy, location, bills } = req.body;

    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }

    // Update fields if provided
    if (name !== undefined) contact.name = name;
    if (phoneNumber !== undefined) contact.phoneNumber = phoneNumber;
    if (address !== undefined) contact.address = address;
    if (submittedBy !== undefined) contact.submittedBy = submittedBy;
    if (location !== undefined) contact.location = location;
    if (bills !== undefined) contact.bills = bills;

    await contact.save();
    return res.status(200).json(contact);
  } catch (error) {
    console.error('[PUT /contacts/:id] Error:', error);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
});

// DELETE a contact by ID
ContactRouter.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    return res.status(200).json({ message: 'Contact deleted successfully.' });
  } catch (error) {
    console.error('[DELETE /contacts/:id] Error:', error);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
});

export default ContactRouter;