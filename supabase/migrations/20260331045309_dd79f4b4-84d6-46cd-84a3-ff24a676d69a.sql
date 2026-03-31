
-- Fix permissive INSERT on notifications: only allow inserting for event creators or admin
DROP POLICY "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Event creators or admin can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR event_id IN (SELECT id FROM public.events WHERE created_by = auth.uid())
  );
