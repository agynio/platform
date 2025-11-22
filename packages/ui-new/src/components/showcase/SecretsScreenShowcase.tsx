import { useState } from 'react';
import SecretsScreen, { Secret } from '../screens/SecretsScreen';

// Generate sample secrets
const generateSampleSecrets = (): Secret[] => {
  const secrets: Secret[] = [];
  
  const usedSecrets = [
    { key: 'DATABASE_PASSWORD', value: 'sup3rS3cr3tP@ssw0rd!' },
    { key: 'API_KEY', value: 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz' },
    { key: 'JWT_SECRET', value: 'myJwtSecretKey123456' },
    { key: 'STRIPE_SECRET_KEY', value: 'sk_test_51234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop' },
    { key: 'AWS_ACCESS_KEY_ID', value: 'AKIAIOSFODNN7EXAMPLE' },
    { key: 'AWS_SECRET_ACCESS_KEY', value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    { key: 'SENDGRID_API_KEY', value: 'SG.1234567890abcdefghijklmnopqrstuvwxyz' },
    { key: 'REDIS_PASSWORD', value: 'r3d1sP@ssw0rd' },
    { key: 'ENCRYPTION_KEY', value: '0123456789abcdef0123456789abcdef' },
    { key: 'OAUTH_CLIENT_SECRET', value: 'gOcSpJaA8bC1dEfGhIjKlMnOpQrStUvWxYz' },
    { key: 'WEBHOOK_SECRET', value: 'whsec_1234567890abcdefghijklmnopqrstuv' },
    { key: 'PRIVATE_KEY', value: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0...' },
  ];

  const missingSecrets = [
    { key: 'OPENAI_API_KEY', value: '' },
    { key: 'SLACK_WEBHOOK_URL', value: '' },
    { key: 'GITHUB_TOKEN', value: '' },
    { key: 'POSTGRES_PASSWORD', value: '' },
  ];

  // Add used secrets
  usedSecrets.forEach((secret, i) => {
    secrets.push({
      id: `secret-${i}`,
      key: secret.key,
      value: secret.value,
      status: 'used',
    });
  });

  // Add missing secrets
  missingSecrets.forEach((secret, i) => {
    secrets.push({
      id: `missing-${i}`,
      key: secret.key,
      value: secret.value,
      status: 'missing',
    });
  });

  // Add more used secrets to demonstrate pagination
  for (let i = usedSecrets.length; i < 25; i++) {
    secrets.push({
      id: `secret-${i}`,
      key: `SECRET_KEY_${i}`,
      value: `secret_value_${i}_${Math.random().toString(36).substring(7)}`,
      status: 'used',
    });
  }

  return secrets;
};

interface SecretsScreenShowcaseProps {
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function SecretsScreenShowcase({ onBack, selectedMenuItem, onMenuItemSelect }: SecretsScreenShowcaseProps) {
  const [secrets, setSecrets] = useState<Secret[]>(generateSampleSecrets());

  const handleCreateSecret = (secret: Omit<Secret, 'id'>) => {
    const newSecret: Secret = {
      id: `secret-${Date.now()}`,
      ...secret,
    };
    setSecrets([newSecret, ...secrets]);
  };

  const handleUpdateSecret = (id: string, secret: Omit<Secret, 'id'>) => {
    setSecrets(secrets.map((s) => (s.id === id ? { ...s, ...secret } : s)));
  };

  const handleDeleteSecret = (id: string) => {
    setSecrets(secrets.filter((s) => s.id !== id));
  };

  return (
    <SecretsScreen
      secrets={secrets}
      onCreateSecret={handleCreateSecret}
      onUpdateSecret={handleUpdateSecret}
      onDeleteSecret={handleDeleteSecret}
      onBack={onBack}
      selectedMenuItem={selectedMenuItem}
      onMenuItemSelect={onMenuItemSelect}
    />
  );
}
