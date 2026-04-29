'use client';

import { useState } from 'react';
import { User, Plug, CreditCard, Save, Bell, Shield } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { KsefSettingsForm } from './ksef-settings-form';
import { BillingSection } from './billing-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/providers/i18n-provider';

type Tab = 'general' | 'ksef' | 'billing';

function GeneralSection() {
  const { user } = useAuth();
  const t = useT();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [riskAlerts, setRiskAlerts] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ full_name: fullName, company, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">{t.settings.profileTitle}</CardTitle>
          </div>
          <CardDescription>{t.settings.profileDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.settings.emailLabel}</Label>
            <Input value={user?.email ?? ''} disabled className="bg-muted/50" />
            <p className="text-xs text-muted-foreground">{t.settings.emailHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullName">{t.settings.fullNameLabel}</Label>
            <Input
              id="fullName"
              placeholder={t.settings.fullNamePlaceholder}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">{t.settings.companyLabel}</Label>
            <Input
              id="company"
              placeholder={t.settings.companyPlaceholder}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Save className="h-4 w-4" />
            {saved ? t.settings.saved : saving ? t.settings.saving : t.settings.saveChanges}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">{t.settings.notificationsTitle}</CardTitle>
          </div>
          <CardDescription>{t.settings.notificationsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t.settings.emailNotifications}</p>
              <p className="text-xs text-muted-foreground">{t.settings.emailNotificationsDesc}</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t.settings.riskAlerts}</p>
              <p className="text-xs text-muted-foreground">{t.settings.riskAlertsDesc}</p>
            </div>
            <Switch checked={riskAlerts} onCheckedChange={setRiskAlerts} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">{t.settings.securityTitle}</CardTitle>
          </div>
          <CardDescription>{t.settings.securityDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">{t.settings.authMethod}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.settings.authMethodDesc}
            </p>
          </div>
          <Button variant="destructive" size="sm">{t.settings.deleteAccount}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const t = useT();

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'general', label: t.settings.tabGeneral, icon: User },
    { id: 'ksef', label: t.settings.tabKsef, icon: Plug },
    { id: 'billing', label: t.settings.tabBilling, icon: CreditCard },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
              activeTab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:block">{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralSection />}
      {activeTab === 'ksef' && <KsefSettingsForm />}
      {activeTab === 'billing' && <BillingSection />}
    </div>
  );
}
