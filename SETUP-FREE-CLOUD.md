# Free Login, Database, and Domain Setup

## 1. Create the free Supabase project
- Go to [Supabase](https://supabase.com/)
- Create a free account
- Create a new free project

## 2. Create the database table
- Open the SQL editor
- Run the SQL from [supabase-schema.sql](C:\Users\SIDDHARTHO MOHANTO\OneDrive\Documents\New project\supabase-schema.sql)

## 3. Add your free project keys
- Open [supabase-config.js](C:\Users\SIDDHARTHO MOHANTO\OneDrive\Documents\New project\supabase-config.js)
- Paste:

```js
window.SUPABASE_CONFIG = {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

## 4. Turn on email login
- In Supabase, go to `Authentication`
- Enable `Email` provider

## 5. Free domain
- Deploy this folder on Vercel
- Your free domain will look like:
  - `operationlifechange.vercel.app`

## 6. Important truth
- Login: free
- Database: free
- Hosting: free
- Subdomain: free
- Custom `.com` domain: not free
