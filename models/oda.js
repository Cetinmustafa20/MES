// models/Oda.js
const mongoose = require('mongoose');

const odaSchema = new mongoose.Schema({
  ad: String,
  tarih: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Oda', odaSchema);
