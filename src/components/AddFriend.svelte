<script lang="ts">
	let { addFriend } = $props();

	let friendCodeInput = $state('');

	function handleAddFriend() {
		if (friendCodeInput.trim() === '') {
			alert('Please enter a friend code.');
			return;
		}
		addFriend(friendCodeInput.trim());
		friendCodeInput = '';
	}
</script>

<div class="flex items-center gap-2">
	<input
		type="text"
		placeholder="Enter Friend Code"
		bind:value={friendCodeInput}
		onkeydown={(e) => e.key === 'Enter' && handleAddFriend()}
		class="flex-1 min-w-0 p-2 rounded border border-white/20 bg-black/20 text-white text-sm"
	/>
	<button
		onclick={handleAddFriend}
		class="px-3 py-2 rounded bg-overlay-light border border-white/20 text-white text-sm transition-colors duration-200 hover:bg-white/20 flex-shrink-0"
	>
		Add
	</button>
</div>
