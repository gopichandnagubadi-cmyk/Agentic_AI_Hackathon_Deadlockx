# Agentic AI Hackathon - DeadlockX

## Backend

This project uses Supabase as its backend:

- Supabase Auth manages login sessions and users.
- PostgreSQL stores profiles, complaints, work orders, infrastructure data, and status history.
- Row-level security restricts citizens, officers, and contractors by role and assignment.
- The private `road-evidence` Storage bucket stores complaint and repair images.
- Database RPCs enforce complaint and work-order status transitions.

## Supabase Setup

1. Open the Supabase project SQL Editor.
2. Run the complete `supabase_schema.sql` file.
3. Confirm these public tables exist: `profiles`, `complaints`, `work_orders`, `drainage`, `waterlogging`, and `status_history`.
4. Create users under Authentication. The trigger creates a citizen profile automatically.
5. Update existing user roles in `profiles` using their Auth UUID:

```sql
update public.profiles
set role = 'officer'
where id = 'AUTH_USER_UUID';
```

Valid roles are `citizen`, `officer`, and `contractor`.

## Run Locally

Serve the `Frontend` directory with VS Code Live Server and open `index.html` through the generated localhost URL. Do not open the file directly because camera, geolocation, and Supabase browser session behavior require a local web origin.

