
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS selected_plan text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    CASE WHEN NEW.email = 'pravinraj02032007@gmail.com' THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$;

UPDATE public.profiles 
SET role = 'admin' 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'pravinraj02032007@gmail.com'
);

DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
CREATE POLICY "Anyone can view approved events or own events" ON public.events
  FOR SELECT USING (
    status = 'approved' OR created_by = auth.uid()
  );
