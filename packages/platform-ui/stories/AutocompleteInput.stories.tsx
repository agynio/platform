import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useState } from 'react';
import { Search } from 'lucide-react';
import {
  AutocompleteInput,
  type AutocompleteOption,
} from '../src/components/AutocompleteInput';

const meta: Meta<typeof AutocompleteInput> = {
  title: 'Components/AutocompleteInput',
  component: AutocompleteInput,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof AutocompleteInput>;

// Helper data & fetchers mirroring the showcase examples

const fruits = [
  'Apple',
  'Banana',
  'Orange',
  'Mango',
  'Pineapple',
  'Strawberry',
  'Blueberry',
  'Raspberry',
  'Blackberry',
  'Watermelon',
];

const countries = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'China',
  'India',
  'Brazil',
  'Mexico',
  'Italy',
  'Spain',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Switzerland',
  'Austria',
  'Belgium',
  'Poland',
  'Portugal',
  'Ireland',
];

function useFetchFruits() {
  return useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise((resolve) => setTimeout(resolve, 200));

    return fruits
      .filter((fruit) => fruit.toLowerCase().includes(query.toLowerCase()))
      .map((fruit) => ({ value: fruit.toLowerCase(), label: fruit }));
  }, []);
}

function useFetchCountries() {
  return useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const filtered = countries
      .filter((country) => country.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);

    return filtered.map((country) => ({ value: country, label: country }));
  }, []);
}

function useFetchUsers() {
  return useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const users = [
      { id: '1', name: 'Alice Johnson', email: 'alice@example.com' },
      { id: '2', name: 'Bob Smith', email: 'bob@example.com' },
      { id: '3', name: 'Charlie Davis', email: 'charlie@example.com' },
      { id: '4', name: 'Diana Wilson', email: 'diana@example.com' },
      { id: '5', name: 'Eve Martinez', email: 'eve@example.com' },
      { id: '6', name: 'Frank Anderson', email: 'frank@example.com' },
    ];

    const filtered = users.filter(
      (user) =>
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase()),
    );

    return filtered.map((user) => ({
      value: user.email,
      label: `${user.name} (${user.email})`,
    }));
  }, []);
}

function useFetchRepositories() {
  return useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const repos = [
      { name: 'react', description: 'A JavaScript library for building user interfaces' },
      { name: 'vue', description: 'The Progressive JavaScript Framework' },
      { name: 'angular', description: 'Platform for building mobile and desktop web applications' },
      { name: 'svelte', description: 'Cybernetically enhanced web apps' },
      { name: 'nextjs', description: 'The React Framework for Production' },
      { name: 'nuxt', description: 'The Intuitive Vue Framework' },
    ];

    const filtered = repos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query.toLowerCase()) ||
        repo.description.toLowerCase().includes(query.toLowerCase()),
    );

    return filtered.map((repo) => ({
      value: repo.name,
      label: `${repo.name} - ${repo.description}`,
    }));
  }, []);
}

export const BasicUsage: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const fetchFruits = useFetchFruits();

    return (
      <div className="max-w-2xl space-y-4">
        <AutocompleteInput
          label="Search Fruits"
          value={value}
          onChange={setValue}
          fetchOptions={fetchFruits}
          placeholder="Start typing to search..."
          clearable
        />
        {value && (
          <div className="text-sm text-[var(--agyn-gray)]">
            Current value:{' '}
            <span className="text-[var(--agyn-dark)]">{value}</span>
          </div>
        )}
      </div>
    );
  },
};

export const CountrySearch: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const fetchCountries = useFetchCountries();

    return (
      <div className="max-w-2xl">
        <AutocompleteInput
          label="Country"
          value={value}
          onChange={setValue}
          fetchOptions={fetchCountries}
          placeholder="Type at least 2 characters..."
          minChars={2}
          clearable
          helperText="Start typing to see country suggestions"
        />
      </div>
    );
  },
};

export const UserSearch: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const [selected, setSelected] = useState<AutocompleteOption | null>(null);
    const fetchUsers = useFetchUsers();

    return (
      <div className="max-w-2xl space-y-4">
        <AutocompleteInput
          label="Search User"
          value={value}
          onChange={setValue}
          onSelect={setSelected}
          fetchOptions={fetchUsers}
          placeholder="Search by name or email..."
          clearable
          helperText="Search for Alice, Bob, Charlie, Diana, Eve, or Frank"
        />
        {selected && (
          <div className="p-4 bg-[var(--agyn-bg-light)] rounded-[10px]">
            <div className="text-sm">
              <p className="text-[var(--agyn-gray)] mb-1">Selected user:</p>
              <p className="text-[var(--agyn-dark)]">{selected.label}</p>
            </div>
          </div>
        )}
      </div>
    );
  },
};

export const RepositorySearch: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const fetchRepositories = useFetchRepositories();

    return (
      <div className="max-w-2xl">
        <AutocompleteInput
          label="Repository"
          value={value}
          onChange={setValue}
          fetchOptions={fetchRepositories}
          placeholder="Search repositories..."
          debounceMs={600}
          clearable
          helperText="Debounced by 600ms to reduce API calls"
        />
      </div>
    );
  },
};

export const Sizes: Story = {
  render: () => {
    const [small, setSmall] = useState('');
    const [def, setDef] = useState('');
    const fetchFruits = useFetchFruits();

    return (
      <div className="max-w-2xl space-y-6">
        <AutocompleteInput
          label="Small Size"
          value={small}
          onChange={setSmall}
          fetchOptions={fetchFruits}
          placeholder="Small input..."
          size="sm"
          clearable
        />
        <AutocompleteInput
          label="Default Size"
          value={def}
          onChange={setDef}
          fetchOptions={fetchFruits}
          placeholder="Default input..."
          size="default"
          clearable
        />
      </div>
    );
  },
};

export const WithIcon: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const fetchFruits = useFetchFruits();

    return (
      <div className="max-w-2xl">
        <AutocompleteInput
          label="Search Products"
          value={value}
          onChange={setValue}
          fetchOptions={fetchFruits}
          placeholder="Search for products..."
          leftIcon={<Search className="w-4 h-4" />}
          clearable
          helperText="Start typing to search for products"
        />
      </div>
    );
  },
};

export const States: Story = {
  render: () => {
    const [errorValue, setErrorValue] = useState('');
    const fetchUsers = useFetchUsers();

    return (
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
    );
  },
};

const codeSample = `import { AutocompleteInput } from './components/AutocompleteInput';

function MyComponent() {
  const [value, setValue] = useState('');

  const fetchOptions = async (query: string) => {
    // Fetch data from API
    const response = await fetch(` + '`/api/search?q=${query}`' + `);
    const data = await response.json();

    return data.map((item) => ({
      value: item.id,
      label: item.name,
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
}`;

export const CodeExample: Story = {
  render: () => {
    return (
      <pre className="bg-[var(--agyn-bg-light)] p-6 rounded-[10px] overflow-x-auto text-sm max-w-2xl">
        <code>{codeSample}</code>
      </pre>
    );
  },
};
