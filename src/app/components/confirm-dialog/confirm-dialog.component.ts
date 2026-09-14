import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Info-only mode: a single acknowledgement button, no confirm/cancel choice. */
  infoOnly?: boolean;
  /** Styles the confirm button as destructive (btn-error) instead of primary. */
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  protected data = inject<ConfirmDialogData>(DIALOG_DATA);
  private dialogRef = inject(DialogRef<boolean>);

  confirm() {
    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close(false);
  }
}
