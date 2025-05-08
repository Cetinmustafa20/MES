// models/message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: String,
  senderId: String,
  message: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
