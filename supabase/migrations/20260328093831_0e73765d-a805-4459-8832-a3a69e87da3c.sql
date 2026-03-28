
-- Tighten event insert to set created_by
DROP POLICY "Authenticated users can create events" ON public.events;
CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Tighten photo insert to only allow for events user created
DROP POLICY "Authenticated users can upload photos" ON public.photos;
CREATE POLICY "Authenticated users can upload photos" ON public.photos FOR INSERT TO authenticated WITH CHECK (
  event_id IN (SELECT id FROM public.events WHERE created_by = auth.uid())
);
