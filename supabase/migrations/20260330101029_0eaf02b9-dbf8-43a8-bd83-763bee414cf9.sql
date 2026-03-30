
-- Allow admin to update any event (for approve/reject)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = 'admin'
  )
$$;

-- Update the events update policy to also allow admin
DROP POLICY IF EXISTS "Creators can update their events" ON public.events;
CREATE POLICY "Creators or admin can update events" ON public.events
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- Allow admin to see all events (including pending) for approval
DROP POLICY IF EXISTS "Anyone can view approved events or own events" ON public.events;
CREATE POLICY "View approved events or own or admin sees all" ON public.events
  FOR SELECT
  USING (
    status = 'approved' 
    OR created_by = auth.uid() 
    OR public.is_admin(auth.uid())
  );
