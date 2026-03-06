-- Create exports table for tracking export jobs
CREATE TABLE IF NOT EXISTS exports (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert 100,000 sample users
DO $$
BEGIN
    FOR i IN 1..100000 LOOP
        INSERT INTO users (name, email, created_at) VALUES (
            'User_' || i,
            'user' || i || '@example.com',
            NOW() - INTERVAL '1 day' * (RANDOM() * 365)
        );
        IF i % 10000 = 0 THEN
            RAISE NOTICE 'Inserted % users', i;
        END IF;
    END LOOP;
END $$;

CREATE INDEX idx_users_created_at ON users(created_at);
