-- VinoFlow Database Schema
-- Automatically executed on first container start by PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────
-- Users
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- ──────────────────────────────────────────
-- Wines
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wines (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid,
    name text NOT NULL,
    cuvee text,
    parcel text,
    producer text,
    vintage integer,
    region text,
    appellation text,
    country text,
    type text,
    grape_varieties text[],
    format text DEFAULT '750ml',
    personal_notes text[],
    sensory_description text,
    aroma_profile text[],
    tasting_notes text,
    suggested_food_pairings text[],
    producer_history text,
    enriched_by_ai boolean DEFAULT false,
    ai_confidence text,
    is_favorite boolean DEFAULT false,
    sensory_profile jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wines_ai_confidence_check CHECK (ai_confidence = ANY (ARRAY['HIGH', 'MEDIUM', 'LOW'])),
    CONSTRAINT wines_type_check CHECK (type = ANY (ARRAY['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED']))
);

CREATE INDEX IF NOT EXISTS idx_wines_region ON wines (region);
CREATE INDEX IF NOT EXISTS idx_wines_type ON wines (type);

-- ──────────────────────────────────────────
-- Bottles (individual bottles of each wine)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bottles (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    wine_id uuid REFERENCES wines(id) ON DELETE CASCADE,
    location jsonb,
    added_by_user_id text,
    purchase_date timestamp with time zone,
    is_consumed boolean DEFAULT false,
    consumed_date timestamp with time zone,
    gifted_to text,
    gift_occasion text,
    purchase_price numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bottles_wine_id ON bottles (wine_id);
CREATE INDEX IF NOT EXISTS idx_bottles_consumed ON bottles (is_consumed);

-- ──────────────────────────────────────────
-- Racks (cellar layout)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS racks (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    type text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT racks_type_check CHECK (type = ANY (ARRAY['SHELF', 'BOX']))
);

-- ──────────────────────────────────────────
-- Spirits (bar / distilled spirits)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spirits (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    category text,
    distillery text,
    region text,
    country text,
    age text,
    cask_type text,
    abv numeric,
    format integer,
    description text,
    producer_history text,
    tasting_notes text,
    aroma_profile text[],
    suggested_cocktails text[],
    culinary_pairings text[],
    enriched_by_ai boolean DEFAULT false,
    is_opened boolean DEFAULT false,
    inventory_level integer DEFAULT 100,
    is_luxury boolean DEFAULT false,
    added_at timestamp with time zone DEFAULT now()
);

-- ──────────────────────────────────────────
-- Tasting notes
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasting_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    date timestamp with time zone DEFAULT now() NOT NULL,
    overall_rating numeric,
    visual_notes jsonb,
    nose_notes jsonb,
    palate_notes jsonb,
    general_notes text,
    occasion text,
    companions text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ──────────────────────────────────────────
-- Journal (cellar activity log)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    date timestamp without time zone DEFAULT now(),
    type character varying(10) NOT NULL,
    wine_id uuid,
    wine_name character varying(255) DEFAULT 'Vin inconnu' NOT NULL,
    wine_vintage integer,
    quantity integer,
    description text,
    from_location text,
    to_location text,
    recipient character varying(255),
    occasion character varying(255),
    note text,
    user_id character varying(255)
);

-- ──────────────────────────────────────────
-- Wishlist
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name character varying(255) NOT NULL,
    producer character varying(255),
    region character varying(255),
    appellation character varying(255),
    type character varying(50),
    vintage integer,
    notes text,
    source character varying(255),
    estimated_price numeric(10,2),
    priority character varying(10) DEFAULT 'MEDIUM',
    added_at timestamp without time zone DEFAULT now()
);
