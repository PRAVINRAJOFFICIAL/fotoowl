
-- Create photo_requests table for "Notify Me" feature
CREATE TABLE public.photo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  face_descriptor float8[] NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.photo_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
CREATE POLICY "Users can insert own photo requests"
  ON public.photo_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can view their own requests
CREATE POLICY "Users can view own photo requests"
  ON public.photo_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own requests
CREATE POLICY "Users can delete own photo requests"
  ON public.photo_requests FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admin can view all requests (for background matching)
CREATE POLICY "Admin can view all photo requests"
  ON public.photo_requests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admin can update notified status
CREATE POLICY "Admin can update photo requests"
  ON public.photo_requests FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Event creators can view requests for their events (for matching on upload)
CREATE POLICY "Event creators can view event photo requests"
  ON public.photo_requests FOR SELECT TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE created_by = auth.uid()));

-- Event creators can update notified status
CREATE POLICY "Event creators can update event photo requests"
  ON public.photo_requests FOR UPDATE TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE created_by = auth.uid()));

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
