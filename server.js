const Database = require("better-sqlite3");
const express = require("express");
const cors = require("cors");

const ADMIN_PASSWORD = "Louka45";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// DB
const db = new Database("db.sqlite");

// ===== TABLES =====
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    image TEXT,
    stock INTEGER DEFAULT 0,
    out_of_stock INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    total REAL,
    payment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ===== API =====

// GET produits
app.get("/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products").all();
  res.json(rows);
});

// ADD produit
app.post("/products", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  const { name, price, stock = 0 } = req.body;

  db.prepare(
    "INSERT INTO products (name, price, stock) VALUES (?, ?, ?)"
  ).run(name, price, stock);

  res.sendStatus(200);
});

// UPDATE produit
app.put("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  const { name, price, stock, out_of_stock } = req.body;

  db.prepare(`
    UPDATE products 
    SET name=?, price=?, stock=?, out_of_stock=? 
    WHERE id=?
  `).run(name, price, stock, out_of_stock ? 1 : 0, req.params.id);

  res.sendStatus(200);
});

// DELETE produit
app.delete("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.sendStatus(200);
});

// LOGIN
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// SALES
app.post("/sales", (req, res) => {
  const { total, payment, items } = req.body;

  // insert vente
  db.prepare(
    "INSERT INTO sales (total, payment) VALUES (?, ?)"
  ).run(total, payment);

  // update stock
  const getProduct = db.prepare("SELECT stock, out_of_stock FROM products WHERE id = ?");
  const updateStock = db.prepare(
    "UPDATE products SET stock=?, out_of_stock=? WHERE id=?"
  );

  items.forEach(item => {
    const row = getProduct.get(item.id);

    if (!row || row.out_of_stock === 1) return;

    const newStock = row.stock - item.qty;

    updateStock.run(
      newStock,
      newStock <= 0 ? 1 : 0,
      item.id
    );
  });

  res.sendStatus(200);
});

// ===== START =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port " + PORT);
});
