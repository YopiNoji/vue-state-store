import * as Interface from './interface'
import * as Utils from './utils'
import { ref, UnwrapRef, watch, onUnmounted } from '@vue/composition-api'

const subscriberQueue: any[] = []


export class Store<T> implements Interface.IStore<T> {
    protected stop: Interface.Unsubscriber | null = null
    protected subscribers: Array<Interface.SubscribeInvalidateTuple<T>> = []
    private _value: T
    protected start: Interface.StartStopNotifier<T>

    constructor(value: T, start: Interface.StartStopNotifier<T> = Utils.noop) {
        this._value = value
        this.start = start
    }

    get(): T {
        return Utils.getStoreValue(this)
    }

    set(newValue: T) {
        return new Promise<void>((resolve) => {
            if (Utils.safeNotEqual(this._value, newValue)) {
                this._value = newValue
                if (this.stop) {
                    const runQueue = !subscriberQueue.length
                    for (let i = 0; i < this.subscribers.length; i += 1) {
                        const s = this.subscribers[i]
                        s[1]()
                        subscriberQueue.push(s, this._value)
                    }
                    if (runQueue) {
                        for (let i = 0; i < subscriberQueue.length; i += 2)
                            subscriberQueue[i][0](subscriberQueue[i + 1])
                        subscriberQueue.length = 0
                    }
                }
                resolve()
            }
        })
    }

    async update(callback: Interface.Updater<T> | Interface.AsyncUpdater<T>) {
        await this.set(await callback(this._value))
    }

    subscribe(
        run: Interface.Subscriber<T>,
        invalidate: Interface.Invalidator<T> = Utils.noop
    ): Interface.Unsubscriber {
        const subscriber: Interface.SubscribeInvalidateTuple<T> = [
            run,
            invalidate,
        ]
        this.subscribers.push(subscriber)
        if (this.subscribers.length === 1)
            this.stop = this.start(this.set) || Utils.noop
        if (this._value) run(this._value)

        return () => {
            const index = this.subscribers.indexOf(subscriber)
            if (index !== -1) this.subscribers.splice(index, 1)
            if (this.subscribers.length === 0) {
                if (this.stop) this.stop()
                this.stop = null
            }
        }
    }

    bind() {
        const bindedValue = ref(this._value)
        const unsubscribeStore = this.subscribe((data) => {
            bindedValue.value = data as UnwrapRef<T>
        })
        const unsubscribeWatch = watch(bindedValue, () => {
            const dataOfObserverRemoved = JSON.parse(JSON.stringify(bindedValue.value))
            this.set(dataOfObserverRemoved as T)
        })
        onUnmounted(() => {
            unsubscribeStore()
            unsubscribeWatch()
        })
        return bindedValue.value
    }

    protected get value() {
        return this.get()
    }

    protected set value(newValue) {
        this.set(newValue)
    }
}
