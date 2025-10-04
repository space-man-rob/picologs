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

<div class="flex flex-col gap-2 p-4 border-t border-white/10 overflow-hidden">
	<input
		type="text"
		placeholder="Enter Friend Code"
		bind:value={friendCodeInput}
		class="w-full p-2 rounded border border-white/20 bg-black/20 text-white box-border"
	/>
	<button
		onclick={handleAddFriend}
		class="w-full bg-white/10 border border-white/20 px-4 py-2 rounded text-white flex items-center justify-center gap-1.5 transition-colors duration-200 hover:bg-white/20"
	>
		➕ Add Friend
	</button>
</div>
