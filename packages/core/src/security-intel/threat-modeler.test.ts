import { describe, it, expect } from 'vitest';
import { ThreatModeler } from './threat-modeler';

describe('ThreatModeler', () => {
  const modeler = new ThreatModeler();

  it('identifies authentication threats', () => {
    const spec = 'Users will login with email and password. JWT tokens will be issued for session management.';
    const model = modeler.analyze('user-auth', spec);

    expect(model.threats.length).toBeGreaterThan(0);
    expect(model.threats.some((t) => t.category === 'spoofing')).toBe(true);
  });

  it('identifies data tampering threats', () => {
    const spec = 'The service will write user profiles to the database and update records on edit.';
    const model = modeler.analyze('user-profiles', spec);

    expect(model.threats.some((t) => t.category === 'tampering')).toBe(true);
  });

  it('identifies privilege escalation threats', () => {
    const spec = 'Admin users can manage roles and permissions for other users via RBAC.';
    const model = modeler.analyze('rbac', spec);

    expect(model.threats.some((t) => t.category === 'elevation-of-privilege')).toBe(true);
    expect(model.threats.some((t) => t.severity === 'critical')).toBe(true);
  });

  it('detects data flows', () => {
    const spec = 'The API endpoint receives requests, stores data in the database, and sends email notifications.';
    const model = modeler.analyze('data-flow', spec);

    expect(model.dataFlows.length).toBeGreaterThan(0);
  });

  it('detects trust boundaries', () => {
    const spec = 'Client-side code sends requests through the auth middleware to the internal API.';
    const model = modeler.analyze('boundaries', spec);

    expect(model.trustBoundaries.length).toBeGreaterThan(0);
  });

  it('generates recommendations for critical threats', () => {
    const spec = 'Admin panel with role-based access control manages all user permissions and authentication.';
    const model = modeler.analyze('admin', spec);

    expect(model.recommendations.length).toBeGreaterThan(0);
  });

  it('attributes threats to components', () => {
    const spec = 'The auth service handles login and token issuance.';
    const model = modeler.analyze('auth', spec, ['auth-service', 'user-db']);

    const authThreats = model.threats.filter((t) => t.affectedComponent === 'auth-service');
    expect(authThreats.length).toBeGreaterThan(0);
  });

  it('returns proper ThreatModel structure', () => {
    const model = modeler.analyze('test', 'A simple feature with no security surface.');

    expect(model.featureSlug).toBe('test');
    expect(model.timestamp).toBeDefined();
    expect(Array.isArray(model.dataFlows)).toBe(true);
    expect(Array.isArray(model.trustBoundaries)).toBe(true);
    expect(Array.isArray(model.threats)).toBe(true);
    expect(Array.isArray(model.recommendations)).toBe(true);
  });
});
