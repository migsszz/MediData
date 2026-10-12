import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { UpdateService } from './update.service';

@Injectable()
class TestableUpdateService extends UpdateService {
  reloads = 0;
  protected override reloadPage() {
    this.reloads++;
  }
}

describe('UpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<unknown>;
  let sw: { isEnabled: boolean; versionUpdates: Subject<VersionEvent>; unrecoverable: Subject<unknown>; checkForUpdate: jasmine.Spy; activateUpdate: jasmine.Spy };

  const ready: VersionEvent = { type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } };

  function create(isEnabled = true) {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    sw = { isEnabled, versionUpdates, unrecoverable, checkForUpdate: jasmine.createSpy('check').and.resolveTo(true), activateUpdate: jasmine.createSpy('activate').and.resolveTo(true) };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }, { provide: UpdateService, useClass: TestableUpdateService }] });
    return TestBed.inject(UpdateService) as TestableUpdateService;
  }

  it('does nothing when no service worker is configured at all', () => {
    TestBed.configureTestingModule({});
    expect(() => TestBed.inject(UpdateService)).not.toThrow();
  });

  it('does nothing when service workers are disabled (dev server)', () => {
    create(false);
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
  });

  it('checks for a new version straight away instead of waiting for the worker to get around to it', () => {
    create();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies a new version immediately when the user has not interacted yet', async () => {
    const svc = create();
    versionUpdates.next(ready);
    await Promise.resolve();
    await Promise.resolve();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(svc.reloads).toBe(1);
    expect(svc.updateReady()).toBeFalse();
  });

  it('only offers a reload once the user has started interacting, and never reloads on its own then', async () => {
    const svc = create();
    window.dispatchEvent(new Event('keydown'));
    versionUpdates.next(ready);
    expect(svc.updateReady()).toBeTrue();
    expect(svc.reloads).toBe(0);

    await svc.applyUpdate();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(svc.reloads).toBe(1);
  });

  it('ignores other version events', () => {
    const svc = create();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'a' } });
    expect(svc.updateReady()).toBeFalse();
    expect(svc.reloads).toBe(0);
  });

  it('reloads when the worker reports an unrecoverable state', () => {
    const svc = create();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'hash mismatch' });
    expect(svc.reloads).toBe(1);
  });

  it('survives being offline: a failed check is swallowed', async () => {
    const svc = create();
    sw.checkForUpdate.and.rejectWith(new Error('offline'));
    await expectAsync(svc.check()).toBeResolved();
  });
});
