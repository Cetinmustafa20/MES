const mongoose = require('mongoose');

const KayitSchema = new mongoose.Schema({
  operator: String,
  makina: String,
  baslangic: String,
  bitis: String,
  durum: String
});

module.exports = mongoose.model('Kayit', KayitSchema);
