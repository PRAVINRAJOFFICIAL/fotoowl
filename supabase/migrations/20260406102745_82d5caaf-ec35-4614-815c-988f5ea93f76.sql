
-- Allow admin to delete any event
DROP POLICY IF EXISTS "Creators can delete their events" ON public.events;
CREATE POLICY "Creators or admin can delete events"
ON public.events
FOR DELETE
TO authenticated
USING ((created_by = auth.uid()) OR is_admin(auth.uid()));

-- Allow admin to delete notifications (needed for cascade)
DROP POLICY IF EXISTS "Admin can delete notifications" ON public.notifications;
CREATE POLICY "Admin or event creator can delete notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()) OR (event_id IN (SELECT id FROM events WHERE created_by = auth.uid())));

-- Allow admin to delete photos (needed for cascade)
DROP POLICY IF EXISTS "Admin can delete photos" ON public.photos;
CREATE POLICY "Admin or creator can delete photos"
ON public.photos
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()) OR (event_id IN (SELECT id FROM events WHERE created_by = auth.uid())));

-- Allow admin to delete faces
DROP POLICY IF EXISTS "Admin can delete faces" ON public.faces;
CREATE POLICY "Admin or creator can delete faces"
ON public.faces
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()) OR (photo_id IN (SELECT p.id FROM photos p JOIN events e ON p.event_id = e.id WHERE e.created_by = auth.uid())));

-- Allow admin to delete photo_requests
DROP POLICY IF EXISTS "Admin can delete photo_requests" ON public.photo_requests;
CREATE POLICY "Admin or creator can delete photo_requests"
ON public.photo_requests
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()) OR (user_id = auth.uid()) OR (event_id IN (SELECT id FROM events WHERE created_by = auth.uid())));
