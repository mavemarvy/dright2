import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, Mail, Clock, Save, Loader2, CheckCircle, AlertCircle,
  Globe, Store, ExternalLink, Plus, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { clearBusinessSettingsCache } from '../../lib/seo';
import type { BusinessSettings } from '../../lib/types';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];

export default function AdminLocalSeoPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newServiceArea, setNewServiceArea] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newSocialPlatform, setNewSocialPlatform] = useState('');
  const [newSocialUrl, setNewSocialUrl] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('business_settings')
      .select('*')
      .eq('is_singleton', true)
      .maybeSingle();

    if (error) {
      setError(error.message);
    } else if (data) {
      setSettings(data as BusinessSettings);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error: updateError } = await supabase
      .from('business_settings')
      .update({
        business_name: settings.business_name,
        tagline: settings.tagline,
        description: settings.description,
        street_address: settings.street_address,
        address_line_2: settings.address_line_2,
        city: settings.city,
        region: settings.region,
        postal_code: settings.postal_code,
        country: settings.country,
        latitude: settings.latitude,
        longitude: settings.longitude,
        phone: settings.phone,
        email: settings.email,
        website_url: settings.website_url,
        logo_url: settings.logo_url,
        hours_json: settings.hours_json,
        service_area: (settings.service_area || []),
        social_profiles: settings.social_profiles,
        google_business_profile_url: settings.google_business_profile_url,
        google_place_id: settings.google_place_id,
        google_maps_embed_url: settings.google_maps_embed_url,
        price_range: settings.price_range,
        service_categories: (settings.service_categories || []),
        updated_at: new Date().toISOString(),
      })
      .eq('is_singleton', true);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      clearBusinessSettingsCache();
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  const updateField = <K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
  };

  const updateHours = (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    if (!settings?.hours_json) return;
    const current = settings.hours_json[day] || { open: '09:00', close: '17:00' };
    updateField('hours_json', {
      ...settings.hours_json,
      [day]: { ...current, [field]: value },
    });
  };

  const addServiceArea = () => {
    if (!newServiceArea.trim() || !settings) return;
    updateField('service_area', [...(settings.service_area || []), newServiceArea.trim()]);
    setNewServiceArea('');
  };

  const removeServiceArea = (area: string) => {
    if (!settings) return;
    updateField('service_area', (settings.service_area || []).filter(a => a !== area));
  };

  const addCategory = () => {
    if (!newCategory.trim() || !settings) return;
    updateField('service_categories', [...(settings.service_categories || []), newCategory.trim()]);
    setNewCategory('');
  };

  const removeCategory = (cat: string) => {
    if (!settings) return;
    updateField('service_categories', (settings.service_categories || []).filter(c => c !== cat));
  };

  const addSocial = () => {
    if (!newSocialPlatform.trim() || !newSocialUrl.trim() || !settings) return;
    updateField('social_profiles', {
      ...(settings.social_profiles || {}),
      [newSocialPlatform.trim().toLowerCase()]: newSocialUrl.trim(),
    });
    setNewSocialPlatform('');
    setNewSocialUrl('');
  };

  const removeSocial = (platform: string) => {
    if (!settings?.social_profiles) return;
    const updated = { ...settings.social_profiles };
    delete updated[platform];
    updateField('social_profiles', updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Could not load business settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary-600" /> Local SEO Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage NAP data, structured data, and Google Business Profile integration
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-5 py-2.5 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {success && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-success-muted text-success rounded-xl px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4" /> Settings saved successfully. SEO cache cleared.
        </motion.div>
      )}
      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-error-muted text-error rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </motion.div>
      )}

      {/* Business Identity */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Store className="w-5 h-5 text-primary-600" /> Business Identity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input
              type="text"
              value={settings.business_name}
              onChange={e => updateField('business_name', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
            <input
              type="text"
              value={settings.tagline || ''}
              onChange={e => updateField('tagline', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Description (for structured data)</label>
          <textarea
            value={settings.description || ''}
            onChange={e => updateField('description', e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
            <input
              type="url"
              value={settings.website_url || ''}
              onChange={e => updateField('website_url', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input
              type="text"
              value={settings.logo_url || ''}
              onChange={e => updateField('logo_url', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </section>

      {/* NAP — Name, Address, Phone */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary-600" /> NAP (Name, Address, Phone)
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          NAP consistency across all pages is critical for local SEO. This data appears in the footer of every page and in JSON-LD structured data.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
            <input
              type="text"
              value={settings.street_address || ''}
              onChange={e => updateField('street_address', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2 (Suite, Unit, etc.)</label>
            <input
              type="text"
              value={settings.address_line_2 || ''}
              onChange={e => updateField('address_line_2', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={settings.city || ''}
              onChange={e => updateField('city', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
            <input
              type="text"
              value={settings.region || ''}
              onChange={e => updateField('region', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <input
              type="text"
              value={settings.postal_code || ''}
              onChange={e => updateField('postal_code', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input
              type="text"
              value={settings.country || ''}
              onChange={e => updateField('country', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-gray-400" /> Phone
            </label>
            <input
              type="tel"
              value={settings.phone || ''}
              onChange={e => updateField('phone', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-gray-400" /> Email
            </label>
            <input
              type="email"
              value={settings.email || ''}
              onChange={e => updateField('email', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
            <input
              type="number"
              step="0.0000001"
              value={settings.latitude ?? ''}
              onChange={e => updateField('latitude', e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
            <input
              type="number"
              step="0.0000001"
              value={settings.longitude ?? ''}
              onChange={e => updateField('longitude', e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </section>

      {/* Opening Hours */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary-600" /> Opening Hours
        </h2>
        <div className="space-y-2">
          {DAYS.map(day => {
            const entry = settings.hours_json?.[day];
            const isClosed = entry?.closed;
            return (
              <div key={day} className="flex items-center gap-4">
                <span className="w-24 text-sm font-medium text-gray-700">{DAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-sm text-gray-500">
                  <input
                    type="checkbox"
                    checked={isClosed || false}
                    onChange={e => updateHours(day, 'closed', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Closed
                </label>
                {!isClosed && (
                  <>
                    <input
                      type="time"
                      value={entry?.open || '09:00'}
                      onChange={e => updateHours(day, 'open', e.target.value)}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="time"
                      value={entry?.close || '17:00'}
                      onChange={e => updateHours(day, 'close', e.target.value)}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Google Business Profile Integration */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary-600" /> Google Business Profile Integration
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google Business Profile URL</label>
            <input
              type="url"
              value={settings.google_business_profile_url || ''}
              onChange={e => updateField('google_business_profile_url', e.target.value)}
              placeholder="https://www.google.com/maps/place/..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google Place ID</label>
            <input
              type="text"
              value={settings.google_place_id || ''}
              onChange={e => updateField('google_place_id', e.target.value)}
              placeholder="ChIJ..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Find your Place ID atdevelopers.google.com/maps/documentation/places/web-service/place-id</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps Embed URL</label>
            <input
              type="url"
              value={settings.google_maps_embed_url || ''}
              onChange={e => updateField('google_maps_embed_url', e.target.value)}
              placeholder="https://www.google.com/maps/embed?pb=..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
            <div className="flex gap-2">
              {PRICE_RANGES.map(range => (
                <button
                  key={range}
                  onClick={() => updateField('price_range', range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    settings.price_range === range
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Service Area */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary-600" /> Service Area
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          List the cities, regions, or areas your business serves. These appear in structured data as <code className="text-xs bg-gray-100 px-1 rounded">areaServed</code> properties.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newServiceArea}
            onChange={e => setNewServiceArea(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addServiceArea())}
            placeholder="Add a city or region..."
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={addServiceArea}
            className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(settings.service_area || []).map(area => (
            <span key={area} className="inline-flex items-center gap-1.5 text-sm bg-gray-100 text-gray-700 rounded-full px-3 py-1.5">
              {area}
              <button onClick={() => removeServiceArea(area)} className="text-gray-400 hover:text-error">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Service Categories */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Categories</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
            placeholder="Add a service category..."
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={addCategory}
            className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(settings.service_categories || []).map(cat => (
            <span key={cat} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 text-gray-700 rounded-lg px-3 py-1.5">
              {cat}
              <button onClick={() => removeCategory(cat)} className="text-gray-400 hover:text-error">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Social Profiles */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Social Profiles</h2>
        <p className="text-xs text-gray-500 mb-4">
          Social profile URLs are included in structured data as <code className="text-xs bg-gray-100 px-1 rounded">sameAs</code> properties, helping search engines verify your business identity.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
          <input
            type="text"
            value={newSocialPlatform}
            onChange={e => setNewSocialPlatform(e.target.value)}
            placeholder="Platform (e.g., twitter)"
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <input
              type="url"
              value={newSocialUrl}
              onChange={e => setNewSocialUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSocial())}
              placeholder="https://..."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              onClick={addSocial}
              className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary-100 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {settings.social_profiles && Object.entries(settings.social_profiles).map(([platform, url]) => (
            <div key={platform} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700 capitalize">{platform}</span>
                <span className="text-gray-400">·</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1">
                  {url.replace(/^https?:\/\//, '')} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <button onClick={() => removeSocial(platform)} className="text-gray-400 hover:text-error">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Save button at bottom */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl px-6 py-3 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
}
