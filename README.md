# Learning Center — LMS starter (GitHub Pages + Supabase)

A tiny, working learning management system:

- **Students** log in, see their lessons, open them, and mark them done.
- **You (admin)** see every student's progress and can add lessons.
- **Free**: GitHub Pages hosts the pages; Supabase (free tier) handles
  accounts, the database, and file storage.

Files: `index.html` (login), `dashboard.html` (student + admin views),
`styles.css`, `config.js` (your keys), `schema.sql` (database setup).

---

## How it fits together

- **GitHub Pages** serves the web pages. It's static — it can't store accounts
  or progress on its own.
- **Supabase** is the backend it talks to: it handles logins, stores progress
  in a database, and keeps your PDFs.
- **Row Level Security (RLS)** — set up by `schema.sql` — is what keeps students
  private from each other. The database itself refuses to give one student
  another student's data, so it's safe to put the public "anon" key in your
  code. (Never put the `service_role` key anywhere here.)

---

## Setup (about 20 minutes)

### 1. Create a Supabase project
Go to supabase.com, sign up, and create a new project (pick a strong database
password and save it). Free tier is fine.

### 2. Build the database
In Supabase, open **SQL Editor → New query**, paste everything from
`schema.sql`, and click **Run**.

### 3. Create your own account, then make yourself admin
- **Authentication → Users → Add user.** Enter your email + a password.
- Back in **SQL Editor**, run this (with your email):

      update profiles set role = 'admin'
      where id = (select id from auth.users where email = 'you@example.com');

### 4. Connect the pages to Supabase
- **Settings → API.** Copy the **Project URL** and the **anon public** key.
- Paste both into `config.js`.

### 5. Add your students
For each student: **Authentication → Users → Add user** (email + password).
They're automatically created as regular students. Send them their login.
*(Tip: turn off public sign-ups under Authentication → Providable/Sign-ups so
only you can create accounts.)*

### 6. Add your lessons
- **HTML lessons:** keep uploading them to GitHub like you already do, then in
  the admin dashboard paste the lesson's URL (e.g.
  `https://yourname.github.io/lessons/lesson1.html`).
- **PDFs:** either drop the PDF in your GitHub repo and use its URL, **or** use
  Supabase **Storage → New bucket** (make it public for now), upload the PDF,
  and paste its public URL. Then add it in the dashboard with type `pdf`.

### 7. Put it online with GitHub Pages
- Create a repo and upload all these files (or `git push`).
- **Settings → Pages →** deploy from your `main` branch, root folder.
- Your site appears at `https://yourname.github.io/your-repo/`.
- Log in there yourself first to confirm the admin view works, then share the
  URL with your students.

---

## Security checklist
- ✅ The **anon** key in `config.js` is meant to be public — RLS protects the data.
- ❌ Never put the **service_role** key in these files or your repo.
- ✅ RLS is enabled on all three tables by `schema.sql` — don't disable it.

---

## Sensible next steps (once the basics work)
- Group lessons into courses, and enroll specific students in specific courses.
- Track partial progress (e.g. % through a lesson), not just done/not-done.
- Let students reset their own password (Supabase has a built-in flow).
- Create student accounts from the admin page itself (needs a small Supabase
  **Edge Function**, so the powerful key stays on the server, never in the page).
- Serve PDFs from a **private** Storage bucket with signed links.
