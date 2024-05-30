
// populatedb.js

const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

// Placeholder for the database file name
const dbFileName = './database.db';

async function initializeDB() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            pet TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );
    `); 

    // Sample data - Replace these arrays with your own data
    const posts = [
        { 
            id: 1, 
            title: 'Dogs are so loyal', 
            content: 'Just watched the video of the dog who waits for his owner at the train station. CRYING', 
            pet: 'dog', 
            username: 'DogLover', 
            timestamp: '2024-05-19 10:00', 
            likes: 0  
        },
        { 
            id: 2,
            title: 'Sleepy Cats', 
            content: 'Cats napping. That\'s it, that\'s the post.', 
            pet: 'cat',
            username: 'CatsRule', 
            timestamp: '2024-05-20 12:00', 
            likes: 0 
        },
    ];

    const users = [
        { 
            id: 1, 
            username: 'DogLover', 
            hashedGoogleId: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b', 
            avatar_url: undefined, 
            memberSince: '2024-05-19 08:00' 
        },
        { 
            id: 2, 
            username: 'CatsRule', 
            hashedGoogleId: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35', 
            avatar_url: undefined, 
            memberSince: '2024-05-20 09:00' },
    ];

    // Insert sample data into the database
    await Promise.all(posts.map(async post => {
        const doesExist = await db.get('SELECT 1 FROM posts WHERE id = ?', [post.id]);
        if (!doesExist) {
            await db.run(
                'INSERT INTO posts (title, content, pet, username, timestamp, likes) VALUES (?, ?, ?, ?, ?, ?)',
                [post.title, post.content, post.pet, post.username, post.timestamp, post.likes]
            );
        }
    }));

    await Promise.all(users.map(user => {
        return db.run(
            'INSERT OR IGNORE INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
        );
    }));

    console.log('Database populated with initial data.');
    await db.close();
}

// initializeDB().catch(err => {
//     console.error('Error initializing database:', err);
// });

module.exports = { initializeDB };