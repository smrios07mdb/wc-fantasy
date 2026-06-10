-- Prompt 39: a manager's display_name is case-insensitively unique within its league.
-- Operator note: if existing rows have duplicate names differing only in case, this migration will
-- fail with a unique-violation. Do NOT auto-rename — surface the colliding rows as an operator
-- decision: SELECT league_id, lower(display_name), array_agg(id) FROM manager GROUP BY 1,2 HAVING count(*)>1;
CREATE UNIQUE INDEX "manager_league_id_lower_display_name_key"
  ON "manager" ("league_id", lower("display_name"));
