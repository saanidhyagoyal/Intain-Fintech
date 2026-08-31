/**
 * Dashboard Render Tests – ensures all dashboard components render
 * without crashing when fed null/empty data.
 *
 * Uses Vitest + React Testing Library with a mocked API client
 * and MemoryRouter for route context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the API client so no real HTTP calls are made
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { exceptions: [], total: 0, loans: [], total_loans: 0, total_events: 0, total_exceptions: 0 } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Mock localStorage for auth token
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(JSON.stringify({
    access_token: 'test-token',
    user_id: 1,
    username: 'operator',
    role: 'DATA_OPERATOR',
  })),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import OperatorDash from '../pages/OperatorDash';
import ReviewerDash from '../pages/ReviewerDash';
import ConsumerDash from '../pages/ConsumerDash';

describe('Dashboard Render Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OperatorDash renders without crashing', () => {
    expect(() => {
      render(
        <MemoryRouter initialEntries={['/operator']}>
          <OperatorDash />
        </MemoryRouter>
      );
    }).not.toThrow();
  });

  it('ReviewerDash renders without crashing', () => {
    expect(() => {
      render(
        <MemoryRouter initialEntries={['/reviewer']}>
          <ReviewerDash />
        </MemoryRouter>
      );
    }).not.toThrow();
  });

  it('ConsumerDash renders without crashing', () => {
    expect(() => {
      render(
        <MemoryRouter initialEntries={['/consumer']}>
          <ConsumerDash />
        </MemoryRouter>
      );
    }).not.toThrow();
  });
});
