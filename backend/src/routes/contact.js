'use strict';
const express = require('express');
const router = express.Router();
const { sendContactEmail } = require('../controllers/ContactUs.controller');

router.post('/', sendContactEmail);
module.exports = router;
