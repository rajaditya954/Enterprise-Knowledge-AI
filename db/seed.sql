-- ============================================================
-- Enterprise Knowledge AI — Seed Data
-- ============================================================

-- Departments
INSERT INTO departments (id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Engineering'),
  ('a0000000-0000-0000-0000-000000000002', 'Human Resources'),
  ('a0000000-0000-0000-0000-000000000003', 'Finance'),
  ('a0000000-0000-0000-0000-000000000004', 'Legal')
ON CONFLICT (name) DO NOTHING;

-- Users (passwords are bcrypt hash of "Password123!")
-- bcrypt cost 12 hash of "Password123!"
INSERT INTO users (id, email, password_hash, role, department_id) VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    'admin@company.com',
    '$2b$12$LJ3m4ys3Hz8Zy0qXKVQhNOBxTNxmFKj9pR5v8YPqKkE3E1HdKxYjO',
    'ADMIN',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'manager.hr@company.com',
    '$2b$12$LJ3m4ys3Hz8Zy0qXKVQhNOBxTNxmFKj9pR5v8YPqKkE3E1HdKxYjO',
    'MANAGER',
    'a0000000-0000-0000-0000-000000000002'
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    'employee.eng@company.com',
    '$2b$12$LJ3m4ys3Hz8Zy0qXKVQhNOBxTNxmFKj9pR5v8YPqKkE3E1HdKxYjO',
    'EMPLOYEE',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'b0000000-0000-0000-0000-000000000004',
    'manager.fin@company.com',
    '$2b$12$LJ3m4ys3Hz8Zy0qXKVQhNOBxTNxmFKj9pR5v8YPqKkE3E1HdKxYjO',
    'MANAGER',
    'a0000000-0000-0000-0000-000000000003'
  ),
  (
    'b0000000-0000-0000-0000-000000000005',
    'employee.hr@company.com',
    '$2b$12$LJ3m4ys3Hz8Zy0qXKVQhNOBxTNxmFKj9pR5v8YPqKkE3E1HdKxYjO',
    'EMPLOYEE',
    'a0000000-0000-0000-0000-000000000002'
  )
ON CONFLICT (email) DO NOTHING;
