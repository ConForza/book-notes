// module imports
import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import axios from 'axios';
import 'dotenv/config';

// settings
const app = express();
const port = 3000;
const pgPass = process.env.PG_PASS;
const booksApiKey = process.env.BOOKS_API_KEY;
var sort = "owned_items.id ASC";
var currentSort = "date";

const db = new pg.Client({
    user: 'postgres',
    host: 'localhost',
    database: 'booknotes',
    password: pgPass,
    port: 5432,
  });

// connect to PostGres DB
db.connect();

// middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

let userId;
let error;

// function to get book details from Google Books API, passing in unique ISBN
async function getBookDetails(isbn) {
    const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
    params: {
        'q': `isbn:${isbn}`,
        'key': booksApiKey
      }
    })

    return response.data.items[0].volumeInfo;
  };

// home route
app.get('/', async (req, res) => {
  const result = await db.query("SELECT * from users");
  const users = result.rows;
  let books
  let bookCover
  var bookDescriptions = [];

  // If user is selected, perform DB query to list books owned by current user. Sort by selected sort method in ejs file
  if (userId) {
    const postResults = await db.query(`SELECT * FROM owned_items JOIN books ON book_id = books.id WHERE user_id = $1 ORDER BY ${sort};`,
    [userId]);
    books = postResults.rows;
    // Populate
    for await (const book of books) {
      const bookDetails = await getBookDetails(book.isbn);
      bookDescriptions.push(bookDetails.description);
  }
}

  // Render index.ejs. Pass variables
  res.render('index.ejs',
  {
    books: books,
    colors: ["red", "yellow", "blue", "blueviolet", "darkgreen", "darkorange", "hotpink", "lightseagreen", "purple"],
    userId: userId,
    users: users,
    bookCover: bookCover,
    bookDescriptions: bookDescriptions,
    error: error,
    currentSort: currentSort
  });
});

// Route for user switching
app.post('/', async (req, res) => {
  userId = req.body.userId;
  res.redirect('/');
});

// Route to add new book
app.post('/add', async (req, res) => {
  const isbn = req.body.isbn;
  const userId = req.body.userId;

  // Catch error if no book is found with entered ISBN
  try {
    if ((await db.query("SELECT * FROM books WHERE isbn = $1", [isbn])).rows.length == 0) {
      try {
        const bookDetails = await getBookDetails(isbn);
        const result = await db.query("INSERT INTO books (isbn, book_name, author) VALUES ($1, $2, $3) RETURNING id;",
        [isbn, bookDetails.title, bookDetails.authors[0]]);
        const newBook = result.rows[0].id;
        await db.query("INSERT INTO owned_items (book_id, user_id) VALUES ($1, $2);",
        [newBook, userId]);
      } catch {
        error = "ISBN number not found";
      }
    }
  } catch(err) {
    error = err;
  }


  res.redirect('/');
});

// Route to update books table
app.post('/update', async (req, res) => {
  const title = req.body.title;
  const author = req.body.author;
  const bookId = req.body.bookId;

  await db.query("UPDATE books SET book_name = $1, author = $2 WHERE id = $3;", [title, author, bookId]);

  res.redirect('/');
});

// Route to delete a book for the selected user on owned_items table
app.post('/delete', async (req, res) => {
  const bookId = req.body.bookId;
  await db.query("DELETE FROM owned_items WHERE book_id = $1 AND user_id = $2", [bookId, userId]);

  res.redirect('/')
});

// Route to establish sort parameter for query
app.post('/sort', async (req, res) => {
  const sortBy = req.body.sortBy;

  switch (sortBy) {
    case 'dateAdded':
      sort = 'owned_items.id ASC';
      currentSort = 'date';
      break;
    case 'author':
      sort = 'books.author ASC';
      currentSort = 'author';
      break;
    case 'title':
      sort = 'books.book_name ASC';
      currentSort = 'title';
      break;

  }
    
    res.redirect('/');
  
  });

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
