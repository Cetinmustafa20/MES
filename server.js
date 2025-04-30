const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const Kayit = require('./models/kayit');
const Admin = require('./models/admin');

const app = express();
const PORT = 3000;

// EJS ve public ayarları
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({ secret: "gizli", resave: false, saveUninitialized: true }));

// Veritabanı bağlantısı
mongoose.connect('mongodb://localhost:27017/mes_db')
  .then(() => console.log('MongoDB bağlantısı başarılı'))
  .catch((err) => console.error('MongoDB bağlantı hatası:', err));

// Giriş sayfası
app.get('/login', (req, res) => {
  if (req.session.kullanici) {
    return res.redirect('/admin');
  }
  res.render('login');
});

// Giriş işlemi
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.render('login', { hata: 'Kullanıcı adı bulunamadı.' });
    }

    // Şifreyi karşılaştır
    const isMatch = await bcrypt.compare(password, admin.password);

    if (isMatch) {
      req.session.kullanici = admin.username;
      return res.redirect('/admin');
    } else {
      return res.render('login', { hata: 'Şifre yanlış.' });
    }
  } catch (err) {
    console.error('Giriş hatası:', err);
    res.status(500).send('Sunucu hatası');
  }
});

app.get('/mesajlasma', (req, res) => {
  res.render('mesajlasma'); // mesajlasma.ejs dosyasını gösterecek
});

// Kayıt sayfası
app.get('/register', (req, res) => {
  res.render('register');
});

// Kayıt işlemi
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const existingUser = await Admin.findOne({ username });

    if (existingUser) {
      return res.render('register', { hata: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Şifreyi hash'le
    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({ username, password: hashedPassword });
    await newAdmin.save();

    res.redirect('/login');
  } catch (err) {
    console.error('Kayıt hatası:', err);
    res.status(500).send('Sunucu hatası');
  }
});

// Admin paneli
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

// Ana sayfa
app.get("/", async (req, res) => {
  try {
    const kayitlar = await Kayit.find().lean();
    res.render("index", { kayitlar });
  } catch (err) {
    console.error("Hata:", err);
    res.status(500).send("Sunucu hatası");
  }
});

// Yeni kayıt formu
app.get('/ekle', (req, res) => {
  res.render('ekle');
});

// Yeni kayıt gönderme
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

// Üretimi başlat
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

// Üretimi tamamla
app.post('/tamamla/:id', async (req, res) => {
  await Kayit.findByIdAndUpdate(req.params.id, {
    bitis: new Date().toISOString(),
    durum: "Tamamlandı"
  });
  res.redirect('/admin');
});

// Üretimi iptal et
app.post('/iptal/:id', async (req, res) => {
  await Kayit.findByIdAndUpdate(req.params.id, {
    bitis: new Date().toISOString(),
    durum: "İptal Edildi"
  });
  res.redirect('/admin');
});

// Çıkış
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.send('Çıkış yaparken hata oluştu');
    res.redirect('/login');
  });
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`MES uygulaması http://localhost:${PORT} adresinde çalışıyor`);
});
