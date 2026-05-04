const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const ADMIN_PASSWORD = "Louka45";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// DB
const db = new sqlite3.Database("./db.sqlite", (err) => {
  if (err) {
    console.error("❌ DB ERROR:", err);
  } else {
    console.log("✅ DB connected");
  }
});

// Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    image TEXT,
    stock INTEGER DEFAULT 0,
    out_of_stock INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    total REAL,
    payment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ===== API =====

// GET produits
app.get("/products", (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) return res.status(500).send(err);
    res.json(rows);
  });
});

// ADD produit
app.post("/products", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  const { name, price, stock = 0 } = req.body;

  db.run(
    "INSERT INTO products (name, price, stock) VALUES (?, ?, ?)",
    [name, price, stock],
    (err) => {
      if (err) return res.status(500).send(err);
      res.sendStatus(200);
    }
  );
});

// UPDATE produit (UNE SEULE VERSION)
app.put("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  const { name, price, stock, out_of_stock } = req.body;

  db.run(
    `UPDATE products SET name=?, price=?, stock=?, out_of_stock=? WHERE id=?`,
    [name, price, stock, out_of_stock ? 1 : 0, req.params.id],
    (err) => {
      if (err) return res.status(500).send(err);
      res.sendStatus(200);
    }
  );
});

// DELETE produit
app.delete("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  db.run("DELETE FROM products WHERE id = ?", [req.params.id], () => {
    res.sendStatus(200);
  });
});

// LOGIN admin
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

  db.run(
    "INSERT INTO sales (total, payment) VALUES (?, ?)",
    [total, payment]
  );

  items.forEach(item => {
    db.get(
      "SELECT stock, out_of_stock FROM products WHERE id = ?",
      [item.id],
      (err, row) => {
        if (!row || row.out_of_stock === 1) return;

        const newStock = row.stock - item.qty;

        db.run(
          "UPDATE products SET stock=?, out_of_stock=? WHERE id=?",
          [newStock, newStock <= 0 ? 1 : 0, item.id]
        );
      }
    );
  });

  res.sendStatus(200);
});

// ===== START =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port " + PORT);
});
