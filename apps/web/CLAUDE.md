# apps/web conventions

- New page → register the route in `App.tsx` + a nav entry in `components/layout/sidebar.tsx`.
- New dashboard widget → wire into `WIDGET_COMPONENTS` (`routes/dashboard.tsx`) and
  `WIDGET_LABELS` (`routes/settings.tsx`).
- "Add/Edit X" forms use the Radix Dialog + zod pattern established in Phase 9
  (`components/ui/dialog.tsx`, `components/ui/form-field.tsx`, `lib/schemas/*.ts`) — reuse it,
  don't invent a new form pattern.
