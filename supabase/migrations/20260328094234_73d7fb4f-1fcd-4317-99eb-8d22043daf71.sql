
-- Create faces table to store face descriptors
CREATE TABLE public.faces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid REFERENCES public.photos(id) ON DELETE CASCADE NOT NULL,
  descriptor float8[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faces ENABLE ROW LEVEL SECURITY;

-- Anyone can read face descriptors (needed for matching)
CREATE POLICY "Anyone can view face descriptors" ON public.faces FOR SELECT USING (true);

-- Only event creators can insert face descriptors (via photo upload)
CREATE POLICY "Event creators can insert face descriptors" ON public.faces FOR INSERT TO authenticated
WITH CHECK (
  photo_id IN (
    SELECT p.id FROM public.photos p
    JOIN public.events e ON p.event_id = e.id
    WHERE e.created_by = auth.uid()
  )
);

-- Event creators can delete face descriptors
CREATE POLICY "Event creators can delete face descriptors" ON public.faces FOR DELETE TO authenticated
USING (
  photo_id IN (
    SELECT p.id FROM public.photos p
    JOIN public.events e ON p.event_id = e.id
    WHERE e.created_by = auth.uid()
  )
);
