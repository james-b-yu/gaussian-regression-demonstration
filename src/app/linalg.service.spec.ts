import { TestBed } from '@angular/core/testing';

import { LinalgService } from './linalg.service';

describe('LinalgService', () => {
  let service: LinalgService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LinalgService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
