-- Op verzoek van de eigenaar: de review van "Max (Elektronica)" hoort niet bij
-- Saldova en gaat van de site af. Niet verwijderd, alleen niet meer goedgekeurd
-- (terug te zetten in Beheer → Reviews). Veilig om vaker te draaien.
UPDATE "Review"
SET "approved" = false
WHERE "name" = 'Max'
  AND "body" LIKE 'Geweldige ervaring! Vanaf het eerste contact%'
  AND "approved" = true;
