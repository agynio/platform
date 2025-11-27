import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ShellToolConfigView from '../ShellToolConfigView';
import GithubCloneRepoToolConfigView from '../GithubCloneRepoToolConfigView';
import SendSlackMessageToolConfigView from '../SendSlackMessageToolConfigView';
import RemindMeToolConfigView from '../RemindMeToolConfigView';
import { TOOL_NAME_HINT } from '@/components/nodeProperties/toolNameHint';

const canonicalHelp = 'Name must match ^[a-z0-9_]{1,64}$';

describe('ShellToolConfigView name field', () => {
  it('surfaces tooltip guidance for naming', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidate = vi.fn();

    render(
      <ShellToolConfigView
        templateName="shellTool"
        value={{}}
        onChange={onChange}
        readOnly={false}
        disabled={false}
        onValidate={onValidate}
      />,
    );

    const trigger = screen.getByLabelText(TOOL_NAME_HINT);
    await user.hover(trigger);

    await waitFor(() => {
      expect(screen.getAllByText(TOOL_NAME_HINT).length).toBeGreaterThan(0);
    });
  });

  it('uses the canonical placeholder and persists valid names', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidate = vi.fn();

    render(
      <ShellToolConfigView
        templateName="shellTool"
        value={{}}
        onChange={onChange}
        readOnly={false}
        disabled={false}
        onValidate={onValidate}
      />,
    );

    const input = screen.getByPlaceholderText('shell_command');
    await user.clear(input);
    onChange.mockClear();
    await user.type(input, 'custom_shell');

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0].name).toBe('custom_shell');
    expect(input).toHaveValue('custom_shell');
    expect(onValidate.mock.calls.at(-1)?.[0]).not.toContain(canonicalHelp);
  });

  it('blocks invalid names and clears to canonical default', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidate = vi.fn();

    render(
      <ShellToolConfigView
        templateName="shellTool"
        value={{ name: 'custom_shell' }}
        onChange={onChange}
        readOnly={false}
        disabled={false}
        onValidate={onValidate}
      />,
    );

    const input = screen.getByPlaceholderText('shell_command');
    onChange.mockClear();
    await user.clear(input);
    await user.type(input, 'bad-name');

    const lastCallName = onChange.mock.calls.at(-1)?.[0].name;
    expect(lastCallName).not.toBe('bad-name');
    expect(await screen.findByText(canonicalHelp)).toBeInTheDocument();
    expect(onValidate.mock.calls.some(([errors]) => errors.includes(canonicalHelp))).toBe(true);

    onChange.mockClear();
    await user.clear(input);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(onChange.mock.calls.at(-1)?.[0].name).toBeUndefined();
    expect(screen.queryByText(canonicalHelp)).not.toBeInTheDocument();
  });
});

describe('GithubCloneRepoToolConfigView name field', () => {
  it('persists valid names and shows canonical placeholder', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GithubCloneRepoToolConfigView
        templateName="githubCloneRepoTool"
        value={{}}
        onChange={onChange}
        readOnly={false}
        disabled={false}
      />,
    );

    const input = screen.getByPlaceholderText('github_clone_repo');
    await user.clear(input);
    onChange.mockClear();
    await user.type(input, 'clone_repo');

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0].name).toBe('clone_repo');
    expect(screen.queryByText(canonicalHelp)).not.toBeInTheDocument();
  });

  it('rejects invalid names and preserves the previous value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GithubCloneRepoToolConfigView
        templateName="githubCloneRepoTool"
        value={{ name: 'clone_repo' }}
        onChange={onChange}
        readOnly={false}
        disabled={false}
      />,
    );

    const input = screen.getByPlaceholderText('github_clone_repo');
    onChange.mockClear();
    await user.clear(input);
    await user.type(input, 'invalid-name');

    const lastCallName = onChange.mock.calls.at(-1)?.[0].name;
    expect(lastCallName).not.toBe('invalid-name');
    expect(await screen.findByText(canonicalHelp)).toBeInTheDocument();
  });
});

describe('SendSlackMessageToolConfigView name field', () => {
  it('emits valid names and resets when cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidate = vi.fn();

    render(
      <SendSlackMessageToolConfigView
        templateName="sendSlackMessageTool"
        value={{}}
        onChange={onChange}
        readOnly={false}
        disabled={false}
        onValidate={onValidate}
      />,
    );

    const input = screen.getByPlaceholderText('send_slack_message');
    await user.clear(input);
    onChange.mockClear();
    await user.type(input, 'slack_notify');

    expect(onChange.mock.calls.at(-1)?.[0].name).toBe('slack_notify');
    expect(onValidate.mock.calls.at(-1)?.[0]).not.toContain(canonicalHelp);

    onChange.mockClear();
    await user.clear(input);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(onChange.mock.calls.at(-1)?.[0].name).toBeUndefined();
  });

  it('prevents invalid names from persisting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onValidate = vi.fn();

    render(
      <SendSlackMessageToolConfigView
        templateName="sendSlackMessageTool"
        value={{ name: 'slack_notify' }}
        onChange={onChange}
        readOnly={false}
        disabled={false}
        onValidate={onValidate}
      />,
    );

    const input = screen.getByPlaceholderText('send_slack_message');
    onChange.mockClear();
    await user.clear(input);
    await user.type(input, 'bad-name');

    const lastCallName = onChange.mock.calls.at(-1)?.[0].name;
    expect(lastCallName).not.toBe('bad-name');
    expect(await screen.findByText(canonicalHelp)).toBeInTheDocument();
    expect(onValidate.mock.calls.some(([errors]) => errors.includes(canonicalHelp))).toBe(true);
  });
});

describe('RemindMeToolConfigView name field', () => {
  it('persists valid names and resets on clear', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RemindMeToolConfigView
        templateName="remindMeTool"
        value={{}}
        onChange={onChange}
        readOnly={false}
        disabled={false}
      />,
    );

    const input = screen.getByPlaceholderText('remind_me');
    await user.clear(input);
    onChange.mockClear();
    await user.type(input, 'reminder_tool');

    expect(onChange.mock.calls.at(-1)?.[0].name).toBe('reminder_tool');

    onChange.mockClear();
    await user.clear(input);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(onChange.mock.calls.at(-1)?.[0].name).toBeUndefined();
  });

  it('shows an error for invalid names', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RemindMeToolConfigView
        templateName="remindMeTool"
        value={{ name: 'reminder_tool' }}
        onChange={onChange}
        readOnly={false}
        disabled={false}
      />,
    );

    const input = screen.getByPlaceholderText('remind_me');
    onChange.mockClear();
    await user.clear(input);
    await user.type(input, 'bad-name');

    const lastCallName = onChange.mock.calls.at(-1)?.[0].name;
    expect(lastCallName).not.toBe('bad-name');
    expect(await screen.findByText(canonicalHelp)).toBeInTheDocument();
  });
});
