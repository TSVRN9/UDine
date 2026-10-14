// What a screen sees for one load. A repository call returns a stream of these: Loading (-> StillLoading if slow)
// then one of Loaded / LoadedOffline / NotSaved / Failed. Retry = call the repository again.
sealed class DataState<T> {
  const DataState();
}

class Loading<T> extends DataState<T> {
  const Loading();
}

/// Still no answer after the repository's slow threshold; the screen decides how to show it.
class StillLoading<T> extends DataState<T> {
  const StillLoading();
}

/// Data to render: the saved copy (cache-first, refresh pending) or the fresh response.
class Loaded<T> extends DataState<T> {
  const Loaded(this.value);
  final T value;
}

/// The saved copy, because the network could not be reached.
class LoadedOffline<T> extends DataState<T> {
  const LoadedOffline(this.value);
  final T value;
}

/// Offline, and nothing was ever saved for this place and day.
class NotSaved<T> extends DataState<T> {
  const NotSaved();
}

/// The server answered badly (or the answer didn't parse) and nothing is saved.
class Failed<T> extends DataState<T> {
  const Failed(this.error);
  final Object error;
}
