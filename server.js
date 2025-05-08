const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const http = require('http');
const server = http.createServer(app);
const socketIO = require('socket.io');
const io = socketIO(server);
const Oda = require('./models/oda');
const Kayit = require('./models/kayit');
const Admin = require('./models/admin');
const Message = require('./models/message'); 

const PORT = 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: "gizli", resave: false, saveUninitialized: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let users = {};

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  socket.on('joinRoom', ({ roomId, userId }) => {
    socket.join(roomId);
    users[socket.id] = { roomId, userId };
  });

  socket.on('sendMessage', async ({ roomId, message, senderId }) => {
    io.to(roomId).emit('receiveMessage', { message, senderId });

    // Mesaj veritabanına kaydediliyor
    try {
      const yeniMesaj = new Message({ roomId, senderId, message });
      await yeniMesaj.save();
    } catch (err) {
      console.error("Mesaj kaydedilemedi:", err);
    }
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
  });
});

mongoose.connect('mongodb://localhost:27017/mes_db')
  .then(() => console.log('MongoDB bağlantısı başarılı'))
  .catch((err) => console.error('MongoDB bağlantı hatası:', err));

app.get('/mesaj', async (req, res) => {
  try {
    const odalar = await Oda.find().lean();
    res.render('mesaj', { odalar });
  } catch (err) {
    console.error('Odalar çekilemedi:', err);
    res.render('mesaj', { odalar: [] });
  }
});

app.post('/mesaj', async (req, res) => {
  const odaAdi = req.body.odaAdi; // Oda Adını alıyoruz

  // Oda adı boş ya da tanımlı değilse, hata mesajı verebiliriz
  if (!odaAdi || typeof odaAdi !== 'string' || odaAdi.trim() === "") {
    console.log("Oda adı boş ya da geçersiz.");
    return res.redirect('/mesaj');
  }

  try {
    let mevcutOda = await Oda.findOne({ ad: odaAdi.trim() });  // Trim uygulandıktan sonra sorgu yapılır
    if (!mevcutOda) {
      mevcutOda = new Oda({ ad: odaAdi.trim() });
      await mevcutOda.save();
    }
    res.redirect(`/mesajlasma/${encodeURIComponent(mevcutOda.ad)}`);
  } catch (err) {
    console.error('Oda oluşturulamadı:', err);
    res.redirect('/mesaj');
  }
});


app.post('/yenioda', async (req, res) => {
  let odaIsmi = req.body.odaAdi;

  // odaIsmi tanımlı ve boş değilse trim uygulanır
  if (!odaIsmi || typeof odaIsmi !== 'string' || odaIsmi.trim() === "") {
    console.log("Oda ismi boş olamaz.");
    return res.status(400).send('Oda ismi boş olamaz.');
  }

  odaIsmi = odaIsmi.trim(); // Trim işlemi burada yapılır

  try {
    const mevcutOda = await Oda.findOne({ ad: odaIsmi });
    if (!mevcutOda) {
      const yeniOda = new Oda({ ad: odaIsmi });
      await yeniOda.save();
      console.log('Yeni oda oluşturuldu:', odaIsmi);
      return res.redirect(`/mesajlasma/${encodeURIComponent(odaIsmi)}`);
    } else {
      console.log('Bu oda zaten mevcut:', odaIsmi);
      return res.redirect(`/mesajlasma/${encodeURIComponent(odaIsmi)}`);
    }
  } catch (err) {
    console.error("Oda oluşturulamadı:", err);
    return res.status(500).send('Oda oluşturulamadı');
  }
});

app.get('/login', (req, res) => {
  if (req.session.kullanici) {
    return res.redirect('/admin');
  }
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.render('login', { hata: 'Kullanıcı adı bulunamadı.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (isMatch) {
      req.session.kullanici = admin.username;
      req.session.userId = admin._id;
      return res.redirect('/admin');
    } else {
      return res.render('login', { hata: 'Şifre yanlış.' });
    }
  } catch (err) {
    console.error('Giriş hatası:', err);
    res.status(500).send('Sunucu hatası');
  }
});

app.get('/mesajlasma/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.session.userId || "Anonim";

  try {
    // Odaya ait mesajlar sıralanır
    const mesajlar = await Message.find({ roomId }).sort({ timestamp: 1 }).lean(); 
    const odalar = await Oda.find().lean(); // Tüm odaları çekiyoruz

    res.render('mesajlasma', {
      roomId,
      userId,
      mesajlar,
      odalar, // EJS'e gönderilen odalar
      aktifOdaId: roomId // Aktif odanın id'si
    });
  } catch (err) {
    console.error("Mesajlar çekilemedi:", err);
    res.render('mesajlasma', {
      roomId,
      userId,
      mesajlar: [], // Mesajlar boş dönerse
      odalar: [],
      aktifOdaId: roomId
    });
  }
});

// Yeni oda eklemek için POST route'u
app.post('/mesajlasma', async (req, res) => {
  const odaAdi = (req.body.odaAdi && req.body.odaAdi.trim()) || ''; 
  if (!odaAdi) {
    return res.redirect('/mesaj'); // Oda adı boş ise ana sayfaya yönlendir
  }

  try {
    const mevcutOda = await Oda.findOne({ ad: odaAdi });
    if (!mevcutOda) {
      const yeniOda = new Oda({ ad: odaAdi }); // Yeni oda oluşturuluyor
      await yeniOda.save();
    }
    res.redirect(`/mesajlasma/${encodeURIComponent(odaAdi)}`); // Oda oluşturulduktan sonra odaya yönlendirilir
  } catch (err) {
    console.error("Oda oluşturulamadı:", err);
    res.redirect('/mesaj');
  }
});


app.post('/mesajlasma/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.session.userId || "Anonim";
  const mesaj = req.body.mesaj;

  if (!mesaj || typeof mesaj !== 'string' || mesaj.trim() === "") {
    console.log("Mesaj boş olamaz.");
    return res.redirect(`/mesajlasma/${roomId}`);
  }

  try {
    const yeniMesaj = new Message({ roomId, senderId: userId, message: mesaj.trim() });
    await yeniMesaj.save();

    io.to(roomId).emit('receiveMessage', { message: mesaj, senderId: userId });

    return res.redirect(`/mesajlasma/${roomId}`); 
  } catch (err) {
    console.error("Mesaj kaydedilemedi:", err);
    return res.status(500).send('Mesaj kaydedilemedi');
  }
});
app.post('/mesajlasma/yeni-oda/gonder', async (req, res) => {
  const odaAdi = req.body.odaAdi.trim(); 

  if (!odaAdi) {
    console.log("Oda adı boş olamaz.");
    return res.status(400).send('Oda adı boş olamaz.');
  }

  try {
    const mevcutOda = await Oda.findOne({ ad: odaAdi });
    if (!mevcutOda) {
      const yeniOda = new Oda({ ad: odaAdi });
      await yeniOda.save();
      console.log('Yeni oda oluşturuldu:', odaAdi);
      return res.redirect(`/mesajlasma/${encodeURIComponent(odaAdi)}`);  
    } else {
      console.log('Bu oda zaten mevcut:', odaAdi);
      return res.redirect(`/mesajlasma/${encodeURIComponent(odaAdi)}`);
    }
  } catch (err) {
    console.error('Oda oluşturulamadı:', err);
    return res.status(500).send('Oda oluşturulamadı');
  }
});
app.get('/mesajlasma/yeni-oda', (req, res) => {
  res.render('yeni-oda');  
});



app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await Admin.findOne({ username });
    if (existingUser) {
      return res.render('register', { hata: 'Bu kullanıcı adı zaten alınmış.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, password: hashedPassword });
    await newAdmin.save();

    res.redirect('/login');
  } catch (err) {
    console.error('Kayıt hatası:', err);
    res.status(500).send('Sunucu hatası');
  }
});

app.get('/admin', async (req, res) => {
  if (!req.session.kullanici) return res.redirect('/login');

  try {
    const kayitlar = await Kayit.find().lean();

    const gunlukVeri = {
      gunler: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'],
      sayilar: [5, 7, 4, 9, 3]
    };

    const makinaVerisi = kayitlar.map(k => k.makina);
    const makinaSet = new Set(makinaVerisi);
    const operatorSet = new Set(kayitlar.map(k => k.operator));
    const toplamOperator = operatorSet.size;

    const bugun = new Date().toISOString().split('T')[0];
    const bugunUretim = kayitlar.filter(k => {
      const tarih = new Date(k.baslangic).toISOString().split('T')[0];
      return tarih === bugun;
    }).length;

    const hedefYuzde = Math.min(Math.round((kayitlar.length / 100) * 100), 100);

    res.render('admin', {
      kullanici: req.session.kullanici,
      kayitlar,
      gunlukVeri,
      makinaVerisi,
      makinaSet,
      toplamOperator,
      bugunUretim,
      hedefYuzde
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Sunucu hatası');
  }
});

app.get("/", async (req, res) => {
  try {
    const kayitlar = await Kayit.find().lean();
    res.render("index", { kayitlar });
  } catch (err) {
    console.error("Hata:", err);
    res.status(500).send("Sunucu hatası");
  }
});

app.get('/ekle', (req, res) => {
  res.render('ekle');
});

app.post('/ekle', async (req, res) => {
  const { operator, makina, baslangic, bitis, durum } = req.body;
  try {
    const yeniKayit = new Kayit({ operator, makina, baslangic, bitis, durum });
    await yeniKayit.save();
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Kayıt eklenemedi');
  }
});

app.post("/basla", async (req, res) => {
  const { operator, makina } = req.body;
  const kayit = new Kayit({
    operator,
    makina,
    baslangic: new Date().toISOString(),
    durum: "Devam Ediyor"
  });
  await kayit.save();
  res.redirect("/admin");
});

app.post('/tamamla/:id', async (req, res) => {
  await Kayit.findByIdAndUpdate(req.params.id, {
    bitis: new Date().toISOString(),
    durum: "Tamamlandı"
  });
  res.redirect('/admin');
});

app.post('/iptal/:id', async (req, res) => {
  await Kayit.findByIdAndUpdate(req.params.id, {
    bitis: new Date().toISOString(),
    durum: "İptal Edildi"
  });
  res.redirect('/admin');
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.send('Çıkış yaparken hata oluştu');
    res.redirect('/login');
  });
});

server.listen(PORT, () => {
  console.log(`MES uygulaması http://localhost:${PORT} adresinde çalışıyor`);
});
