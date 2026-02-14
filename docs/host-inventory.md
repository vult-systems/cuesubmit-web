# Render Farm Host Inventory

> This file is excluded from the public repository for security reasons.
> It contains internal IP addresses, host UUIDs, and hardware details.
>
> To generate an up-to-date inventory, query the OpenCue PostgreSQL database:
>
> ```bash
> PGPASSWORD=$OPENCUE_DB_PASSWORD psql -U cuebot -h 127.0.0.1 -d cuebot_local -c "
>   SELECT h.str_name, h.str_fqdn, h.pk_host, h.int_cores, h.int_mem,
>          h.str_lock_state, a.str_name as allocation
>   FROM host h JOIN alloc a ON a.pk_alloc = h.pk_alloc
>   ORDER BY a.str_name, h.str_name;
> "
> ```
>
> Keep the actual inventory in a private location (private wiki, internal docs, etc.).
