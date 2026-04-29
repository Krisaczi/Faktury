import { Header } from '@/components/layout/header';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { pl as t } from '@/lib/i18n/pl';

export default function SettingsPage() {
  return (
    <div className="flex flex-col">
      <Header
        title={t.settings.title}
        description={t.settings.subtitle}
      />
      <div className="p-6">
        <SettingsTabs />
      </div>
    </div>
  );
}
