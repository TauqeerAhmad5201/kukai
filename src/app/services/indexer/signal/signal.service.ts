import { Injectable } from '@angular/core';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { CONSTANTS } from '../../../../environments/environment';
import { WalletService } from '../../wallet/wallet.service';
import { Account, OpStatus } from '../../wallet/wallet';
import { ActivityService } from '../../activity/activity.service';
import { OperationService } from '../../operation/operation.service';
import { BalanceService } from '../../balance/balance.service';
import { DelegateService } from '../../delegate/delegate.service';
import { CoordinatorService } from '../../coordinator/coordinator.service';
@Injectable({
  providedIn: 'root'
})
export class SignalService {
  connection: any = null;
  constructor(
    private walletService: WalletService,
    private activityService: ActivityService,
    private operationService: OperationService,
    private balanceService: BalanceService,
    private delegateService: DelegateService,
    private coordinatorServcie: CoordinatorService
  ) {}
  async init() {
    this.connection = new HubConnectionBuilder().withUrl(`${CONSTANTS.API_URL}/events`).build();
    this.connection.on('operations', (msg) => {
      console.log('msg');
      for (const op of msg.data) {
        if (op?.status === 'applied') {
          console.log('%csignalR msg', 'color: green;', op);
          const sender: string = op?.sender?.address ?? '';
          const target: string = op?.target?.address ?? '';
          const opHash: string = op?.hash ?? '';
          const invoke: boolean = !!op?.parameter;
          this.confirmStatus(opHash, sender, op.timestamp, invoke);
          this.confirmStatus(opHash, target, op.timestamp, invoke);
        }
      }
    });
    this.connection.onclose(async () => {
      await this.start();
    });
    this.start();
  }
  confirmStatus(opHash: string, address: string, timestamp: string, invoke: boolean) {
    if (opHash && address && this.walletService.wallet) {
      if (this.walletService.wallet) {
        const account: Account = this.walletService.wallet.getAccount(address);
        if (account) {
          for (let i in account.activities) {
            if (account.activities[i].hash === opHash && account.activities[i].status === OpStatus.UNCONFIRMED) {
              account.activities[i].timestamp = new Date(timestamp).getTime();
              if (invoke) {
                account.activities[i].status = OpStatus.HALF_CONFIRMED;
              } else {
                account.activities[i].status = OpStatus.CONFIRMED;
                this.activityService.promptNewActivities(account, [], [account.activities[i]]);
                this.updateAccountData(address);
              }
            }
          }
        }
      }
    }
  }
  updateAccountData(pkh: string) {
    this.coordinatorServcie.update(pkh);
  }

  async start() {
    try {
      if (!!this.connection?.start) {
        await this.connection?.start();
        console.log('%cSignalR Connected!', 'color:green;');
      } else {
        setTimeout(() => {
          this.start();
        }, 5000);
      }
    } catch (err) {
      console.log(err);
      setTimeout(() => {
        this.start();
      }, 5000);
    }
  }

  async subscribeToAccount(address: string) {
    console.log('Listen to: ' + address);
    try {
      await this.connection.invoke('SubscribeToOperations', {
        address,
        types: 'transaction,delegation,origination,staking'
      });
    } catch (e) {
      console.error(e);
    }
  }
  ngOnDestroy(): void {
    try {
      this.connection.stop();
      console.log('%cSignalR Disconnected!', 'color:red;');
    } catch (e) {}
  }
}
