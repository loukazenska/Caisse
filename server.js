const Database = require("better-sqlite3");
const express = require("express");
const cors = require("cors");

const ADMIN_PASSWORD = "Louka45";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===== DB =====
const db = new Database("db.sqlite");

// ===== TABLES =====
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    stock INTEGER DEFAULT 0,
    out_of_stock INTEGER DEFAULT 0,
    category TEXT DEFAULT 'other',
    position INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    total REAL,
    payment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ===== MIGRATIONS SAFE =====
try { db.exec(`ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'other'`); } catch(e){}
try { db.exec(`ALTER TABLE products ADD COLUMN position INTEGER DEFAULT 0`); } catch(e){}


// ===== API =====

// ✅ GET produits (ordre + sync propre SANS casser la DB)
app.get("/products", (req, res) => {

  const rows = db.prepare(`
    SELECT *
    FROM products
    ORDER BY position ASC, id ASC
  `).all();

  res.json(rows);
});


// ✅ ADD produit (auto position)
app.post("/products", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  try {
    const { name, price, stock = 0, category = "other" } = req.body;

    const max = db.prepare("SELECT MAX(position) as max FROM products").get();

    db.prepare(`
      INSERT INTO products (name, price, stock, category, position)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      price,
      stock,
      category,
      (max.max || 0) + 1
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


// ✅ UPDATE produit (logique rupture propre)
app.put("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  try {
    let { name, price, stock, out_of_stock, category, position } = req.body;

    let finalOut;

    if (out_of_stock) {
      finalOut = 1; // admin force
    } else if (stock <= 0) {
      finalOut = 1; // auto rupture
    } else {
      finalOut = 0; // stock OK
    }

    db.prepare(`
      UPDATE products 
      SET name=?, price=?, stock=?, out_of_stock=?, category=?, position=? 
      WHERE id=?
    `).run(
      name,
      price,
      stock,
      finalOut,
      category || "other",
      position ?? 0,
      req.params.id
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


// ✅ DELETE
app.delete("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  try {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


// ✅ LOGIN
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});


// ✅ SALES (ANTI BUG MULTI TEL)
app.post("/sales", (req, res) => {
  const { total, payment, items } = req.body;

  const getProduct = db.prepare("SELECT stock, out_of_stock FROM products WHERE id = ?");
  const updateStock = db.prepare(
    "UPDATE products SET stock=?, out_of_stock=? WHERE id=?"
  );
  const insertSale = db.prepare(
    "INSERT INTO sales (total, payment) VALUES (?, ?)"
  );

  const transaction = db.transaction(() => {

    // 🔴 CHECK STOCK
    for (const item of items) {
      const row = getProduct.get(item.id);

      if (!row) throw new Error("Produit introuvable");

      if (row.out_of_stock === 1 || row.stock < item.qty) {
        throw new Error("Stock insuffisant pour " + item.name);
      }
    }

    // ✅ SAVE SALE
    insertSale.run(total, payment);

    // ✅ UPDATE STOCK
    for (const item of items) {
      const row = getProduct.get(item.id);
      const newStock = row.stock - item.qty;

      updateStock.run(
        newStock,
        newStock <= 0 ? 1 : 0,
        item.id
      );
    }

  });

  try {
    transaction();
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ===== START =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port " + PORT);
});
