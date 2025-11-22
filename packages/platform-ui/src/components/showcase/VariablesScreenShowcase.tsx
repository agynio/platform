import { useState } from 'react';
import VariablesScreen, { Variable } from '../screens/VariablesScreen';

// Generate sample variables
const generateSampleVariables = (): Variable[] => {
  const variables: Variable[] = [];
  
  const sampleKeys = [
    'API_KEY',
    'DATABASE_URL',
    'REDIS_HOST',
    'JWT_SECRET',
    'SMTP_SERVER',
    'AWS_REGION',
    'BUCKET_NAME',
    'MAX_CONNECTIONS',
    'TIMEOUT',
    'DEBUG_MODE',
    'LOG_LEVEL',
    'PORT',
    'HOST',
    'ENV',
    'APP_NAME',
    'VERSION',
    'CACHE_TTL',
    'MAX_RETRIES',
    'BATCH_SIZE',
    'WORKER_THREADS',
  ];

  const graphValues = [
    'prod-value-123',
    'https://db.example.com',
    'redis.internal',
    '***********',
    'smtp.gmail.com',
    'us-east-1',
    'app-storage-prod',
    '100',
    '30000',
    'false',
    'info',
    '8080',
    '0.0.0.0',
    'production',
    'my-app',
    '1.0.0',
    '3600',
    '3',
    '50',
    '4',
  ];

  const localValues = [
    'dev-value-456',
    'http://localhost:5432',
    'localhost',
    'dev-secret-key',
    'localhost',
    'us-west-2',
    'app-storage-dev',
    '10',
    '5000',
    'true',
    'debug',
    '3000',
    'localhost',
    'development',
    'my-app-dev',
    '1.0.0-dev',
    '60',
    '5',
    '10',
    '2',
  ];

  for (let i = 0; i < 25; i++) {
    const idx = i % sampleKeys.length;
    variables.push({
      id: `var-${i}`,
      key: sampleKeys[idx] + (i >= sampleKeys.length ? `_${Math.floor(i / sampleKeys.length)}` : ''),
      graphValue: graphValues[idx],
      localValue: localValues[idx],
    });
  }

  return variables;
};

interface VariablesScreenShowcaseProps {
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function VariablesScreenShowcase({ onBack, selectedMenuItem, onMenuItemSelect }: VariablesScreenShowcaseProps) {
  const [variables, setVariables] = useState<Variable[]>(generateSampleVariables());

  const handleCreateVariable = (variable: Omit<Variable, 'id'>) => {
    const newVariable: Variable = {
      id: `var-${Date.now()}`,
      ...variable,
    };
    setVariables([newVariable, ...variables]);
  };

  const handleUpdateVariable = (id: string, variable: Omit<Variable, 'id'>) => {
    setVariables(variables.map((v) => (v.id === id ? { ...v, ...variable } : v)));
  };

  const handleDeleteVariable = (id: string) => {
    setVariables(variables.filter((v) => v.id !== id));
  };

  return (
    <VariablesScreen
      variables={variables}
      onCreateVariable={handleCreateVariable}
      onUpdateVariable={handleUpdateVariable}
      onDeleteVariable={handleDeleteVariable}
      onBack={onBack}
      selectedMenuItem={selectedMenuItem}
      onMenuItemSelect={onMenuItemSelect}
    />
  );
}
