const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const PORT = process.env.PORT || 3000;

const app = express();

app.use(function (req, res, next) {
    const allowedOrigins = ['https://home-app-front.onrender.com']; // Add your website URL
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, UPDATE');
    next();
  });

app.use(cors());
app.use(express.json());



const db = new Client({
  user: 'homeapp_yspx_user',
  host: 'dpg-clrfnijh3k0c73aiidmg-a.frankfurt-postgres.render.com',
  database: 'homeapp_yspx',
  password: 'u8WTrTTl13c1qowvav7fk5bdMI8UGxSp',
  port: 5432,
  ssl: {
    rejectUnauthorized: false, // This line allows a connection to a server with a self-signed certificate
  },
});

db.connect()
  .then(() => console.log('Database connected'))
  .catch((err) => console.error('Database connection error:', err));

  app.get('/', (req, res) => {
    // Fetch data from the login table
    const fetchLoginDataSql = 'SELECT * FROM login';

    db.query(fetchLoginDataSql, (err, loginData) => {
        if (err) {
            console.error('Error fetching login data:', err);
            return res.status(500).json({ error: 'Error fetching login data' });
        }

        // Send the login table data in the response
        res.json({ status: 'LoginDataFetched', loginData });
    });
});

app.post('/signup', (req, res) => {
    bcrypt.hash(req.body.password, saltRounds, (err, hash) => {
        if (err) {
            console.error('Bcrypt error:', err);
            return res.status(500).json("Error");
        }

        const sql = 'INSERT INTO login (name, email, password) VALUES ($1, $2, $3)';
        const values = [req.body.name, req.body.email, hash];

        db.query(sql, values, (err, data) => {
            if (err) {
                console.error('Database query error:', err);
                if (err.code === '23505') { // Unique constraint violation
                    return res.json("EmailInUse");
                } else {
                    return res.json("Error");
                }
            }
            return res.json(data);
        });
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const userEmail = email[0];
    const userPassword = password[0];

    const emailSql = 'SELECT * FROM login WHERE email = $1';

    db.query(emailSql, [userEmail], (err, emailData) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: 'Error' });
        }

        if (emailData.length === 0) {
            return res.json({ status: "NoUser" });
        }

        const userId = emailData[0].id;

        const storedPasswordHash = emailData[0].password;

        bcrypt.compare(userPassword, storedPasswordHash, (bcryptErr, result) => {
            if (bcryptErr) {
                console.error('Bcrypt error:', bcryptErr);
                return res.status(500).json({ error: 'Error' });
            }

            if (result) {
                const homeSql = 'SELECT * FROM home WHERE user_id = $1';

                db.query(homeSql, [userId], (err, homeData) => {
                    if (err) {
                        console.error('Database query error:', err);
                        return res.status(500).json({ error: 'Error' });
                    }

                    if (homeData.length > 0) {
                        return res.json({ status: "Success", userId: userId });
                    } else {
                        return res.json({ status: "NoHome", userId: userId });
                    }
                });
            } else {
                return res.json({ status: "Failure" });
            }
        });
    });
});

app.post('/create-home', (req, res) => {
    const userId = req.body.userId;
    const homeName = req.body.name;

    // Function to generate a random 4-digit number
    const generateRandomTag = () => Math.floor(1000 + Math.random() * 9000);

    // Initial attempt to generate a unique home tag
    let homeTag = generateRandomTag();

    // Function to recursively check and generate a unique home tag
    const insertHomeWithUniqueTag = () => {
        const createHomeSql = 'INSERT INTO home (user_id, name, tag) VALUES ($1, $2, $3)';
        const values = [userId, homeName, homeTag];

        db.query(createHomeSql, values, (err, data) => {
            if (err) {
                // If the error is due to a non-unique tag, generate a new one and try again
                if (err.code === '23505') { // Unique constraint violation
                    homeTag = generateRandomTag();
                    insertHomeWithUniqueTag(); // Retry with the new tag
                } else {
                    console.error('Create home query error:', err);
                    return res.status(500).json({ error: 'Error' });
                }
            } else {
                return res.json({ status: 'HomeCreated', homeId: data.insertId, homeTag });
            }
        });
    };

    // Initial attempt to insert with a unique tag
    insertHomeWithUniqueTag();
});

app.post('/fetch-home', (req, res) => {
    const userId = req.body.userId;

    const homeSql = 'SELECT * FROM home WHERE user_id = $1';

    db.query(homeSql, [userId], (err, homeData) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ status: 'Error' });
        }

        if (homeData.length > 0) {
            const { id: homeId, name: homeName } = homeData[0];
            return res.json({ status: 'Success', homeId, homeName });
        } else {
            return res.json({ status: 'NoHome' });
        }
    });
});

app.post('/add-todo', (req, res) => {
    const userId = req.body.userId;
    const homeId = req.body.homeId;
    const task = req.body.task;

    const addTodoSql = 'INSERT INTO todos (home_id, task) VALUES ($1, $2)';
    db.query(addTodoSql, [homeId, task], (err, result) => {
        if (err) {
            console.error('Error adding todo:', err);
            return res.status(500).json({ status: 'Error' });
        }

        const insertedTodoId = result.insertId;
        return res.json({ status: 'TodoAdded', todoId: insertedTodoId, homeId });
    });
});

app.post('/fetch-todos', (req, res) => {
    const homeId = req.body.homeId;

    const fetchTodosSql = 'SELECT * FROM todos WHERE home_id = $1';
    db.query(fetchTodosSql, [homeId], (err, todos) => {
        if (err) {
            console.error('Error fetching todos:', err);
            return res.status(500).json({ status: 'Error' });
        }

        return res.json({ status: 'Success', todos });
    });
});

// Add this route to handle todo deletion
app.post('/delete-todo', (req, res) => {
    const todoId = req.body.todoId;

    const deleteTodoSql = 'DELETE FROM todos WHERE id = $1';
    db.query(deleteTodoSql, [todoId], (err, result) => {
        if (err) {
            console.error('Error deleting todo:', err);
            return res.status(500).json({ status: 'Error' });
        }

        return res.json({ status: 'TodoDeleted' });
    });
});

app.post('/add-note', (req, res) => {
    const { homeId, note } = req.body;

    // Insert the note into the database
    const sql = 'INSERT INTO notes (home_id, note_text) VALUES ($1, $2)';
    db.query(sql, [homeId, note], (err, result) => {
        if (err) {
            console.error('Error inserting note:', err);
            res.status(500).json({ status: 'ErrorAddingNote' });
        } else {
            const noteId = result.insertId;
            console.log('Note added successfully with ID:', noteId);
            res.json({ status: 'NoteAdded', noteId });
        }
    });
});

app.post('/fetch-notes', (req, res) => {
    const { homeId } = req.body;

    // Fetch notes from the database based on homeId
    const sql = 'SELECT id, note_text, checked FROM notes WHERE home_id = $1';
    db.query(sql, [homeId], (err, results) => {
        if (err) {
            console.error('Error fetching notes:', err);
            return res.status(500).json({ status: 'ErrorFetchingNotes' });
        } else {
            // Convert the checked property to a boolean
            const notes = results.map((row) => ({ id: row.id, text: row.note_text, checked: row.checked === 1 }));
            res.json({ status: 'NotesFetched', notes });
        }
    });
});

app.post('/update-note-checked-state', (req, res) => {
    const { noteId, checked } = req.body;

    // Update the checked state in the database
    const updateNoteSql = 'UPDATE notes SET checked = $1 WHERE id = $2';
    db.query(updateNoteSql, [checked, noteId], (err, result) => {
        if (err) {
            console.error('Error updating note checked state:', err);
            res.status(500).json({ status: 'ErrorUpdatingNoteCheckedState' });
        } else {
            res.json({ status: 'NoteCheckedStateUpdated' });
        }
    });
});

app.post('/clear-notes', (req, res) => {
    const homeId = req.body.homeId;

    const clearNotesSql = 'DELETE FROM notes WHERE home_id = $1';
    db.query(clearNotesSql, [homeId], (err, result) => {
        if (err) {
            console.error('Error clearing notes:', err);
            return res.status(500).json({ status: 'ErrorClearingNotes' });
        }

        return res.json({ status: 'NotesCleared' });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
