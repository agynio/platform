import { useState, useCallback } from 'react';
import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { AutocompleteInput, AutocompleteOption } from '../AutocompleteInput';
import { Search } from 'lucide-react';

interface AutocompleteInputShowcaseProps {
  onBack: () => void;
}

export default function AutocompleteInputShowcase({ onBack }: AutocompleteInputShowcaseProps) {
  const [basicValue, setBasicValue] = useState('');
  const [countryValue, setCountryValue] = useState('');
  const [userValue, setUserValue] = useState('');
  const [repoValue, setRepoValue] = useState('');
  const [smallSizeValue, setSmallSizeValue] = useState('');
  const [defaultSizeValue, setDefaultSizeValue] = useState('');
  const [errorValue, setErrorValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<AutocompleteOption | null>(null);
  const [searchValue, setSearchValue] = useState('');

  // Mock countries data
  const countries = [
    'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
    'France', 'Japan', 'China', 'India', 'Brazil', 'Mexico', 'Italy',
    'Spain', 'Netherlands', 'Sweden', 'Norway', 'Denmark', 'Finland',
    'Switzerland', 'Austria', 'Belgium', 'Poland', 'Portugal', 'Ireland'
  ];

  // Simple fruit autocomplete
  const fetchFruits = useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const fruits = ['Apple', 'Banana', 'Orange', 'Mango', 'Pineapple', 'Strawberry', 'Blueberry', 'Raspberry', 'Blackberry', 'Watermelon'];
    
    const filtered = fruits
      .filter(fruit => fruit.toLowerCase().includes(query.toLowerCase()))
      .map(fruit => ({ value: fruit.toLowerCase(), label: fruit }));
    
    return filtered;
  }, []);

  // Simple synchronous-to-async wrapper for countries
  const fetchCountries = useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const filtered = countries
      .filter(country => country.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);
    
    return filtered.map(country => ({
      value: country,
      label: country
    }));
  }, [countries]);

  // Mock user search
  const fetchUsers = useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    
    const users = [
      { id: '1', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: '2', name: 'Bob Smith', email: 'bob@example.com' },
      { id: '3', name: 'Charlie Davis', email: 'charlie@example.com' },
      { id: '4', name: 'Diana Wilson', email: 'diana@example.com' },
      { id: '5', name: 'Eve Martinez', email: 'eve@example.com' },
      { id: '6', name: 'Frank Anderson', email: 'frank@example.com' },
    ];

    const filtered = users.filter(user =>
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email.toLowerCase().includes(query.toLowerCase())
    );

    return filtered.map(user => ({
      value: user.email,
      label: `${user.name} (${user.email})`
    }));
  }, []);

  // Mock repository search
  const fetchRepositories = useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const repos = [
      { name: 'react', description: 'A JavaScript library for building user interfaces' },
      { name: 'vue', description: 'The Progressive JavaScript Framework' },
      { name: 'angular', description: 'Platform for building mobile and desktop web applications' },
      { name: 'svelte', description: 'Cybernetically enhanced web apps' },
      { name: 'nextjs', description: 'The React Framework for Production' },
      { name: 'nuxt', description: 'The Intuitive Vue Framework' },
    ];

    const filtered = repos.filter(repo =>
      repo.name.toLowerCase().includes(query.toLowerCase()) ||
      repo.description.toLowerCase().includes(query.toLowerCase())
    );

    return filtered.map(repo => ({
      value: repo.name,
      label: `${repo.name} - ${repo.description}`
    }));
  }, []);

  return (
    <div>
      <ComponentPreviewHeader
        title="Autocomplete Input"
        description="Input field with async autocomplete suggestions"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Usage */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Usage</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Simple autocomplete with async data fetching
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-4">
              <AutocompleteInput
                label="Search Fruits"
                value={basicValue}
                onChange={setBasicValue}
                fetchOptions={fetchFruits}
                placeholder="Start typing to search..."
                clearable
              />
              
              {basicValue && (
                <div className="text-sm text-[var(--agyn-gray)]">
                  Current value: <span className="text-[var(--agyn-dark)]">{basicValue}</span>
                </div>
              )}
            </div>
          </PanelBody>
        </Panel>

        {/* Country Search */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Country Search</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Search from a list of countries with minimum characters
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl">
              <AutocompleteInput
                label="Country"
                value={countryValue}
                onChange={setCountryValue}
                fetchOptions={fetchCountries}
                placeholder="Type at least 2 characters..."
                minChars={2}
                clearable
                helperText="Start typing to see country suggestions"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* User Search */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>User Search</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Search users by name or email with onSelect callback
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-4">
              <AutocompleteInput
                label="Search User"
                value={userValue}
                onChange={setUserValue}
                onSelect={(option) => setSelectedOption(option)}
                fetchOptions={fetchUsers}
                placeholder="Search by name or email..."
                clearable
                helperText="Search for Alice, Bob, Charlie, Diana, Eve, or Frank"
              />

              {selectedOption && (
                <div className="p-4 bg-[var(--agyn-bg-light)] rounded-[10px]">
                  <div className="text-sm">
                    <p className="text-[var(--agyn-gray)] mb-1">Selected user:</p>
                    <p className="text-[var(--agyn-dark)]">{selectedOption.label}</p>
                  </div>
                </div>
              )}
            </div>
          </PanelBody>
        </Panel>

        {/* Repository Search */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Repository Search</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Search with longer debounce time
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl">
              <AutocompleteInput
                label="Repository"
                value={repoValue}
                onChange={setRepoValue}
                fetchOptions={fetchRepositories}
                placeholder="Search repositories..."
                debounceMs={600}
                clearable
                helperText="Debounced by 600ms to reduce API calls"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Small and default size variants
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-6">
              <AutocompleteInput
                label="Small Size"
                value={smallSizeValue}
                onChange={setSmallSizeValue}
                fetchOptions={fetchFruits}
                placeholder="Small input..."
                size="sm"
                clearable
              />

              <AutocompleteInput
                label="Default Size"
                value={defaultSizeValue}
                onChange={setDefaultSizeValue}
                fetchOptions={fetchFruits}
                placeholder="Default input..."
                size="default"
                clearable
              />
            </div>
          </PanelBody>
        </Panel>

        {/* With Icon */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>With Leading Icon</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Autocomplete with search icon
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl">
              <AutocompleteInput
                label="Search Products"
                value={searchValue}
                onChange={setSearchValue}
                fetchOptions={fetchFruits}
                placeholder="Search for products..."
                leftIcon={<Search className="w-4 h-4" />}
                clearable
                helperText="Start typing to search for products"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>States</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Error and disabled states
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="max-w-2xl space-y-6">
              <AutocompleteInput
                label="Error State"
                value={errorValue}
                onChange={setErrorValue}
                fetchOptions={fetchUsers}
                error="User not found"
                clearable
              />

              <AutocompleteInput
                label="Disabled State"
                value="Disabled value"
                onChange={() => {}}
                fetchOptions={fetchUsers}
                disabled
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Code Example */}
        <Panel variant="flat">
          <PanelHeader>
            <h3>Code Example</h3>
          </PanelHeader>
          <PanelBody>
            <pre className="bg-[var(--agyn-bg-light)] p-6 rounded-[10px] overflow-x-auto">
              <code className="text-sm">{`import { AutocompleteInput } from './components/AutocompleteInput';

function MyComponent() {
  const [value, setValue] = useState('');

  const fetchOptions = async (query: string) => {
    // Fetch data from API
    const response = await fetch(\`/api/search?q=\${query}\`);
    const data = await response.json();
    
    return data.map(item => ({
      value: item.id,
      label: item.name
    }));
  };

  return (
    <AutocompleteInput
      label="Search"
      value={value}
      onChange={setValue}
      fetchOptions={fetchOptions}
      placeholder="Start typing..."
      debounceMs={300}
      minChars={2}
      clearable
      onSelect={(option) => console.log('Selected:', option)}
    />
  );
}`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}